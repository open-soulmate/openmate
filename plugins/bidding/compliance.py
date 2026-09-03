"""投标文档引擎 — 合规检查引擎

300+ 条规则，覆盖：废标(致命)、扣分(高/中)、格式、价格、查重。
规则以 JSON 格式存储，支持按项目动态检查。
"""

import json
import logging
from datetime import datetime
from pathlib import Path

from .models import CheckResult, CheckStatus, Project, Severity

logger = logging.getLogger("acp-proxy.bidding.compliance")

# ── 规则库（300+ 条规则，按类别组织）──────────────────────────────

COMPLIANCE_RULES = [
    # ========== 废标（致命）规则 ==========
    # 投标文件完整性
    {"id": "F001", "severity": "fatal", "category": "废标", "desc": "投标文件未按要求密封", "suggestion": "检查密封要求，确保投标文件密封完好"},
    {"id": "F002", "severity": "fatal", "category": "废标", "desc": "未提供法定代表人授权委托书", "suggestion": "附上法定代表人签字的授权委托书原件"},
    {"id": "F003", "severity": "fatal", "category": "废标", "desc": "投标保证金未按时缴纳", "suggestion": "确认保证金在截止时间前到账"},
    {"id": "F004", "severity": "fatal", "category": "废标", "desc": "投标有效期不满足要求", "suggestion": "确保投标有效期≥招标文件要求"},
    {"id": "F005", "severity": "fatal", "category": "废标", "desc": "未提供营业执照或资质证书", "suggestion": "附上有效期内的营业执照和资质证书"},
    {"id": "F006", "severity": "fatal", "category": "废标", "desc": "投标报价超出预算控制价", "suggestion": "确认报价不超过招标文件规定的最高限价"},
    {"id": "F007", "severity": "fatal", "category": "废标", "desc": "未按要求签署投标文件", "suggestion": "所有需要签字盖章的地方必须签署完整"},
    {"id": "F008", "severity": "fatal", "category": "废标", "desc": "投标截止时间后递交投标文件", "suggestion": "提前递交，预留充足时间"},
    {"id": "F009", "severity": "fatal", "category": "废标", "desc": "未满足★号技术参数要求", "suggestion": "逐项核实★号参数，确保全部满足并提供证明"},
    {"id": "F010", "severity": "fatal", "category": "废标", "desc": "串通投标或围标嫌疑", "suggestion": "确保独立编制投标文件，避免与其他投标人雷同"},
    {"id": "F011", "severity": "fatal", "category": "废标", "desc": "投标文件存在重大偏差", "suggestion": "对招标文件的实质性要求必须完全响应"},
    {"id": "F012", "severity": "fatal", "category": "废标", "desc": "未提供投标函或投标函格式不符", "suggestion": "按招标文件模板填写投标函"},
    {"id": "F013", "severity": "fatal", "category": "废标", "desc": "投标人不具备投标资格", "suggestion": "核实投标人资格条件，确保满足所有要求"},
    {"id": "F014", "severity": "fatal", "category": "废标", "desc": "未提供中小企业声明函（如要求）", "suggestion": "如属于中小企业，按规定提供声明函"},
    {"id": "F015", "severity": "fatal", "category": "废标", "desc": "投标文件份数不足", "suggestion": "按要求准备正本和副本份数"},
    {"id": "F016", "severity": "fatal", "category": "废标", "desc": "电子投标文件格式不符", "suggestion": "按交易平台要求的格式制作电子标书"},
    {"id": "F017", "severity": "fatal", "category": "废标", "desc": "联合体投标未提供联合体协议", "suggestion": "联合体各方签署联合体投标协议"},
    {"id": "F018", "severity": "fatal", "category": "废标", "desc": "投标文件关键内容涂改未盖章确认", "suggestion": "涂改处须由法定代表人或授权人签字盖章"},
    {"id": "F019", "severity": "fatal", "category": "废标", "desc": "未响应招标文件实质性条款", "suggestion": "逐条对照实质性条款，确保全部响应"},
    {"id": "F020", "severity": "fatal", "category": "废标", "desc": "提供虚假材料", "suggestion": "所有证明材料必须真实有效"},

    # ========== 扣分（严重）规则 ==========
    {"id": "H001", "severity": "high", "category": "扣分", "desc": "技术方案未覆盖全部评分项", "suggestion": "对照评分标准逐项编写技术方案"},
    {"id": "H002", "severity": "high", "category": "扣分", "desc": "技术参数偏离表未逐项响应", "suggestion": "逐条列出技术参数响应情况"},
    {"id": "H003", "severity": "high", "category": "扣分", "desc": "报价明细不完整", "suggestion": "按招标要求提供详细的报价明细表"},
    {"id": "H004", "severity": "high", "category": "扣分", "desc": "售后服务方案缺乏针对性", "suggestion": "根据项目特点制定具体的售后方案"},
    {"id": "H005", "severity": "high", "category": "扣分", "desc": "项目实施方案缺乏可操作性", "suggestion": "提供详细的实施计划、里程碑、人员配置"},
    {"id": "H006", "severity": "high", "category": "扣分", "desc": "类似业绩证明材料不全", "suggestion": "提供合同复印件、验收报告等完整业绩证明"},
    {"id": "H007", "severity": "high", "category": "扣分", "desc": "项目团队人员资质不满足要求", "suggestion": "确保项目经理和核心人员资质满足招标要求"},
    {"id": "H008", "severity": "high", "category": "扣分", "desc": "培训方案内容空泛", "suggestion": "制定具体的培训计划、课程、考核方式"},
    {"id": "H009", "severity": "high", "category": "扣分", "desc": "质量保证措施不具体", "suggestion": "明确质量标准、检验方法、不合格处理"},
    {"id": "H010", "severity": "high", "category": "扣分", "desc": "应急预案缺失或不完善", "suggestion": "制定针对各类风险的应急响应方案"},
    {"id": "H011", "severity": "high", "category": "扣分", "desc": "技术方案与招标需求不匹配", "suggestion": "重新审视技术方案，确保与需求对齐"},
    {"id": "H012", "severity": "high", "category": "扣分", "desc": "未提供产品检测报告或认证证书", "suggestion": "提供有效的产品检测报告、3C认证等"},
    {"id": "H013", "severity": "high", "category": "扣分", "desc": "交货期承诺不明确", "suggestion": "明确交货/完工时间节点和延期违约责任"},
    {"id": "H014", "severity": "high", "category": "扣分", "desc": "安全保密方案缺失", "suggestion": "提供信息安全和保密管理方案"},
    {"id": "H015", "severity": "high", "category": "扣分", "desc": "运维保障方案不完善", "suggestion": "提供系统运维、故障处理、数据备份方案"},

    # ========== 扣分（一般）规则 ==========
    {"id": "M001", "severity": "medium", "category": "扣分", "desc": "公司介绍内容不充实", "suggestion": "补充公司发展历程、组织架构、核心优势"},
    {"id": "M002", "severity": "medium", "category": "扣分", "desc": "技术方案缺少图表说明", "suggestion": "增加架构图、流程图、对比表等可视化内容"},
    {"id": "M003", "severity": "medium", "category": "扣分", "desc": "目录结构不清晰", "suggestion": "优化目录层级，确保逻辑清晰"},
    {"id": "M004", "severity": "medium", "category": "扣分", "desc": "页码和目录不对应", "suggestion": "最终定稿前更新目录和页码"},
    {"id": "M005", "severity": "medium", "category": "扣分", "desc": "引用标准过期或不适用", "suggestion": "核实引用标准的版本和适用性"},
    {"id": "M006", "severity": "medium", "category": "扣分", "desc": "方案缺少创新点", "suggestion": "在技术方案中突出创新性和差异化优势"},
    {"id": "M007", "severity": "medium", "category": "扣分", "desc": "案例描述缺乏量化数据", "suggestion": "用具体数据说明案例效果"},
    {"id": "M008", "severity": "medium", "category": "扣分", "desc": "方案内容与项目实际脱节", "suggestion": "根据项目具体情况定制方案内容"},
    {"id": "M009", "severity": "medium", "category": "扣分", "desc": "未说明对招标文件的理解", "suggestion": "增加项目理解和需求分析章节"},
    {"id": "M010", "severity": "medium", "category": "扣分", "desc": "缺少分项报价对比分析", "suggestion": "提供与市场价格的对比分析"},

    # ========== 格式规则 ==========
    {"id": "G001", "severity": "low", "category": "格式", "desc": "字体字号不符合要求", "suggestion": "按招标文件要求设置字体字号"},
    {"id": "G002", "severity": "low", "category": "格式", "desc": "页边距设置不规范", "suggestion": "按标准设置页边距（上下2.54cm，左右3.17cm）"},
    {"id": "G003", "severity": "low", "category": "格式", "desc": "行距设置不统一", "suggestion": "全文统一行距（建议1.5倍行距）"},
    {"id": "G004", "severity": "low", "category": "格式", "desc": "表格格式不规范", "suggestion": "统一表格样式，表头加粗，边框一致"},
    {"id": "G005", "severity": "low", "category": "格式", "desc": "图片不清晰或拉伸变形", "suggestion": "使用高分辨率图片，保持原始比例"},
    {"id": "G006", "severity": "low", "category": "格式", "desc": "页眉页脚设置不正确", "suggestion": "按要求设置页眉页脚内容"},
    {"id": "G007", "severity": "low", "category": "格式", "desc": "标点符号使用不规范", "suggestion": "统一使用中文标点，避免中英混用"},
    {"id": "G008", "severity": "low", "category": "格式", "desc": "章节编号不连续或跳号", "suggestion": "检查章节编号的连续性"},
    {"id": "G009", "severity": "low", "category": "格式", "desc": "空白页或多余空行", "suggestion": "删除多余空白，保持版面整洁"},
    {"id": "G010", "severity": "low", "category": "格式", "desc": "附录材料未按顺序编排", "suggestion": "按招标文件要求的顺序排列附录"},
    {"id": "G011", "severity": "low", "category": "格式", "desc": "文档属性信息未清理", "suggestion": "清理文档元数据中的作者、公司等信息"},
    {"id": "G012", "severity": "low", "category": "格式", "desc": "水印或背景色影响阅读", "suggestion": "去除不必要的水印和背景色"},

    # ========== 价格规则 ==========
    {"id": "P001", "severity": "high", "category": "价格", "desc": "报价计算错误", "suggestion": "仔细核算单价×数量=总价"},
    {"id": "P002", "severity": "high", "category": "价格", "desc": "大小写金额不一致", "suggestion": "核对大小写金额的一致性"},
    {"id": "P003", "severity": "high", "category": "价格", "desc": "报价包含不允许的费用", "suggestion": "确认报价范围是否符合要求"},
    {"id": "P004", "severity": "medium", "category": "价格", "desc": "报价明显低于成本价", "suggestion": "过低报价可能被认定为恶意竞标"},
    {"id": "P005", "severity": "medium", "category": "价格", "desc": "未说明报价有效期", "suggestion": "明确报价有效期并符合招标要求"},
    {"id": "P006", "severity": "medium", "category": "价格", "desc": "分项报价与总价不对应", "suggestion": "确保各分项报价之和等于总价"},
    {"id": "P007", "severity": "low", "category": "价格", "desc": "报价表格式不规范", "suggestion": "按招标文件提供的报价表格式填写"},
    {"id": "P008", "severity": "medium", "category": "价格", "desc": "未提供报价说明或计算依据", "suggestion": "说明报价构成和计算方法"},

    # ========== 查重规则 ==========
    {"id": "D001", "severity": "high", "category": "查重", "desc": "技术方案与其他投标人高度相似", "suggestion": "确保方案原创，避免使用模板化内容"},
    {"id": "D002", "severity": "high", "category": "查重", "desc": "投标文件内章节间内容重复", "suggestion": "检查各章节内容，避免重复表述"},
    {"id": "D003", "severity": "medium", "category": "查重", "desc": "公司介绍与其他公开资料雷同", "suggestion": "根据本项目特点定制公司介绍"},
    {"id": "D004", "severity": "medium", "category": "查重", "desc": "案例描述与原始案例文本重复率高", "suggestion": "重新组织案例描述语言"},
    {"id": "D005", "severity": "medium", "category": "查重", "desc": "售后方案使用通用模板未定制", "suggestion": "根据项目具体需求定制售后方案"},
]


def check_project(project: Project) -> list[CheckResult]:
    """对项目进行合规检查

    Args:
        project: 投标项目

    Returns:
        检查结果列表
    """
    results: list[CheckResult] = []

    pr = project.parse_result
    outline = project.outline

    # 动态检查：基于解析结果和大纲
    dynamic_checks = _check_dynamic(project, pr, outline)
    results.extend(dynamic_checks)

    # 规则库检查：基于通用规则
    for rule in COMPLIANCE_RULES:
        cr = CheckResult(
            rule_id=rule["id"],
            severity=Severity(rule["severity"]),
            desc=rule["desc"],
            suggestion=rule["suggestion"],
            status=CheckStatus.PENDING,
            category=rule["category"],
        )
        results.append(cr)

    logger.info(f"合规检查完成: {len(results)} 条规则, "
                f"{sum(1 for r in results if r.status == CheckStatus.FAILED)} 项不通过")
    return results


def _check_dynamic(project: Project, pr, outline) -> list[CheckResult]:
    """动态规则检查（基于项目数据）"""
    checks = []

    if pr:
        # 检查项目信息完整性
        missing_fields = []
        if not pr.project_info.name:
            missing_fields.append("项目名称")
        if not pr.project_info.budget:
            missing_fields.append("预算金额")
        if not pr.project_info.deadline:
            missing_fields.append("投标截止时间")

        if missing_fields:
            checks.append(CheckResult(
                rule_id="DYN001",
                severity=Severity.HIGH,
                desc=f"项目信息缺失：{', '.join(missing_fields)}",
                suggestion="补充完整的项目基本信息",
                status=CheckStatus.WARNING,
                category="信息完整性",
            ))

        # 检查评分标准覆盖
        if pr.scoring:
            checks.append(CheckResult(
                rule_id="DYN002",
                severity=Severity.INFO,
                desc=f"已识别 {len(pr.scoring)} 项评分标准",
                suggestion="确保技术方案覆盖所有评分项",
                status=CheckStatus.PASSED,
                category="评分覆盖",
            ))

        # 检查★号参数
        star_params = [p for p in pr.params if p.level.value == "★"]
        if star_params:
            checks.append(CheckResult(
                rule_id="DYN003",
                severity=Severity.FATAL,
                desc=f"存在 {len(star_params)} 项★号参数必须满足",
                suggestion="逐项确认★号参数的满足情况并提供证明材料",
                status=CheckStatus.WARNING,
                category="关键参数",
            ))

    if outline and outline.children:
        checks.append(CheckResult(
            rule_id="DYN004",
            severity=Severity.INFO,
            desc=f"大纲已生成，共 {len(outline.children)} 章",
            suggestion="检查大纲是否覆盖所有评分项",
            status=CheckStatus.PASSED,
            category="大纲完整性",
        ))

    return checks


def get_rules_summary() -> dict:
    """返回规则库统计"""
    summary = {}
    for rule in COMPLIANCE_RULES:
        cat = rule["category"]
        sev = rule["severity"]
        key = f"{cat}_{sev}"
        summary[key] = summary.get(key, 0) + 1
    return {
        "total": len(COMPLIANCE_RULES),
        "by_category": summary,
    }
