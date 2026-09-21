-- gene-loop migration 001: gene_proposals 提案表 + 4条数据层不变量
-- 依据: 架构v2.1 §3.3（opensoul d3b22245）; 设计借鉴 ai-memory V22（不变量写进数据库，不靠提示词自觉）
-- 日期: 2026-09-21

CREATE TABLE IF NOT EXISTS gene_proposals (
    proposal_id     TEXT PRIMARY KEY,
    source_cycle    TEXT NOT NULL,
    actor           TEXT NOT NULL CHECK (actor IN ('evo','soulmate','hermes','user')),
    type            TEXT NOT NULL CHECK (type IN ('new_rule','refine_rule','deprecate_rule','lesson')),
    content         TEXT NOT NULL,
    governance      TEXT NOT NULL CHECK (governance IN ('constraint','context')),
    scope           TEXT NOT NULL CHECK (scope = 'global' OR scope LIKE 'project:%'),
    confidence      REAL NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    evidence        TEXT NOT NULL,  -- JSON数组 [{"quote": "...", "source": "..."}]
    status          TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed','approved','rejected','promoted')),
    review_reviewer TEXT CHECK (review_reviewer IS NULL OR review_reviewer IN ('hermes','user')),
    review_reason   TEXT,
    review_at       INTEGER,
    promoted_to     TEXT,           -- 形如 gene:global:{id} / gene:project:{repo}:{id}
    created_at      INTEGER NOT NULL,
    promoted_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_gp_status ON gene_proposals(status);
CREATE INDEX IF NOT EXISTS idx_gp_scope  ON gene_proposals(scope);
CREATE INDEX IF NOT EXISTS idx_gp_source ON gene_proposals(source_cycle);

-- ── 不变量1：无证据不立案（evidence必须为非空JSON数组） ──
CREATE TRIGGER IF NOT EXISTS trg_gp_inv1_ins
BEFORE INSERT ON gene_proposals
WHEN NOT (json_valid(NEW.evidence) AND json_array_length(NEW.evidence) >= 1)
BEGIN
    SELECT RAISE(ABORT, 'INV1: evidence must be a non-empty JSON array');
END;

CREATE TRIGGER IF NOT EXISTS trg_gp_inv1_upd
BEFORE UPDATE OF evidence, status ON gene_proposals
WHEN NEW.status IN ('proposed','approved','promoted')
  AND NOT (json_valid(NEW.evidence) AND json_array_length(NEW.evidence) >= 1)
BEGIN
    SELECT RAISE(ABORT, 'INV1: evidence must be a non-empty JSON array');
END;

-- ── 不变量2：promote溯源闭合 —— status='promoted' ⟺ (promoted_at与promoted_to均非空) ──
CREATE TRIGGER IF NOT EXISTS trg_gp_inv2_ins
BEFORE INSERT ON gene_proposals
WHEN (NEW.status = 'promoted')
     != (NEW.promoted_at IS NOT NULL AND NEW.promoted_to IS NOT NULL AND NEW.promoted_to != '')
BEGIN
    SELECT RAISE(ABORT, 'INV2: status=promoted requires both promoted_at and promoted_to');
END;

CREATE TRIGGER IF NOT EXISTS trg_gp_inv2_upd
BEFORE UPDATE OF status, promoted_at, promoted_to ON gene_proposals
WHEN (NEW.status = 'promoted')
     != (NEW.promoted_at IS NOT NULL AND NEW.promoted_to IS NOT NULL AND NEW.promoted_to != '')
BEGIN
    SELECT RAISE(ABORT, 'INV2: status=promoted requires both promoted_at and promoted_to');
END;

-- ── 不变量3：作用域不越级 —— project提案禁止promote为global（promoted_to前缀编码目标作用域） ──
CREATE TRIGGER IF NOT EXISTS trg_gp_inv3_ins
BEFORE INSERT ON gene_proposals
WHEN NEW.status = 'promoted' AND NEW.scope LIKE 'project:%'
  AND NEW.promoted_to NOT LIKE 'gene:project:%'
BEGIN
    SELECT RAISE(ABORT, 'INV3: project-scope proposal cannot be promoted to global');
END;

CREATE TRIGGER IF NOT EXISTS trg_gp_inv3_upd
BEFORE UPDATE OF scope, status, promoted_to ON gene_proposals
WHEN NEW.status = 'promoted' AND NEW.scope LIKE 'project:%'
  AND NEW.promoted_to NOT LIKE 'gene:project:%'
BEGIN
    SELECT RAISE(ABORT, 'INV3: project-scope proposal cannot be promoted to global');
END;

-- ── 不变量4：evo/soulmate禁直接promoted —— 必须经review通道（reviewer为hermes或user） ──
CREATE TRIGGER IF NOT EXISTS trg_gp_inv4_ins
BEFORE INSERT ON gene_proposals
WHEN NEW.status = 'promoted' AND NEW.actor IN ('evo','soulmate')
  AND (NEW.review_reviewer IS NULL OR NEW.review_reviewer NOT IN ('hermes','user'))
BEGIN
    SELECT RAISE(ABORT, 'INV4: evo/soulmate proposals must pass review channel before promote');
END;

CREATE TRIGGER IF NOT EXISTS trg_gp_inv4_upd
BEFORE UPDATE OF status, review_reviewer, actor ON gene_proposals
WHEN NEW.status = 'promoted' AND NEW.actor IN ('evo','soulmate')
  AND (NEW.review_reviewer IS NULL OR NEW.review_reviewer NOT IN ('hermes','user'))
BEGIN
    SELECT RAISE(ABORT, 'INV4: evo/soulmate proposals must pass review channel before promote');
END;
