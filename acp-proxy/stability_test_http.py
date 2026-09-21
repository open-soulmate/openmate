"""Soulmate会话稳定性测试 — 同一会话100轮对话 (HTTP路径)

测试路径: HTTP POST /acp/send → proxy → stdio → Soulmate ACP subprocess
先创建session，然后同一session_id发100条消息。

记录每轮: success/fail, latency, response_len, error_type
"""
import asyncio
import json
import time
import sys
import httpx

PROXY_URL = "http://127.0.0.1:8092"
NUM_ROUNDS = 100
PROMPT_TIMEOUT = 120

TEST_PROMPTS = [
    "你好，请用一句话介绍你自己",
    "1+1等于几？",
    "请列出3个Python列表去重的方法",
    "什么是快速排序？简要说明",
    "帮我写一个Python的hello world",
    "解释一下什么是RESTful API",
    "今天适合做什么？给个建议",
    "请用一句话总结什么是机器学习",
    "HTTP和HTTPS有什么区别？",
    "请推荐3本技术书籍",
    "什么是Docker？简短回答",
    "请解释什么是递归",
    "Python的GIL是什么？",
    "什么是微服务架构？",
    "请说明TCP三次握手",
    "什么是数据库索引？",
    "解释一下什么是缓存穿透",
    "什么是CAP定理？",
    "请解释什么是死锁",
    "git rebase和merge有什么区别？",
]


async def run_test():
    print("=" * 60)
    print("Soulmate 会话稳定性测试 — 同一会话100轮 (HTTP)")
    print("=" * 60)

    results = []
    session_id = None

    async with httpx.AsyncClient(timeout=PROMPT_TIMEOUT) as client:
        # Step 1: Create session by sending first message with empty session_id
        print("\n[1/2] 创建会话...")
        t0 = time.monotonic()
        try:
            resp = await client.post(
                f"{PROXY_URL}/acp/send",
                json={"text": "你好，请简短回复", "session_id": ""},
            )
            data = resp.json()
            if data.get("ok"):
                session_id = data.get("session_id", "")
                print(f"  ✅ 会话已创建: session_id={session_id}")
                print(f"  首次回复({round(time.monotonic()-t0,1)}s): {data.get('content','')[:80]}")
                # Record round 0 (session creation)
                results.append({
                    "round": 0,
                    "prompt": "[session create]",
                    "success": True,
                    "latency_s": round(time.monotonic() - t0, 2),
                    "response_len": len(data.get("content", "")),
                    "error_type": None,
                    "error_msg": "",
                    "response_preview": data.get("content", "")[:100],
                })
            else:
                print(f"  ❌ 会话创建失败: {data.get('error')}")
                return []
        except Exception as e:
            print(f"  ❌ 连接失败: {type(e).__name__}: {e}")
            return []

        # Step 2: Run 100 rounds on the same session
        print(f"\n[2/2] 开始100轮对话测试 (session={session_id})...")
        for i in range(NUM_ROUNDS):
            prompt_text = TEST_PROMPTS[i % len(TEST_PROMPTS)]
            start = time.monotonic()
            result = {
                "round": i + 1,
                "prompt": prompt_text[:50],
                "success": False,
                "latency_s": 0,
                "response_len": 0,
                "error_type": None,
                "error_msg": "",
                "response_preview": "",
            }

            try:
                resp = await client.post(
                    f"{PROXY_URL}/acp/send",
                    json={"text": prompt_text, "session_id": session_id},
                )
                data = resp.json()
                elapsed = round(time.monotonic() - start, 2)
                result["latency_s"] = elapsed

                if data.get("ok"):
                    content = data.get("content", "")
                    result["response_len"] = len(content)
                    result["response_preview"] = content[:100]
                    if content:
                        result["success"] = True
                    else:
                        result["error_type"] = "empty_response"
                        result["error_msg"] = "Response was empty"
                else:
                    error = data.get("error", "unknown")
                    result["error_type"] = classify_error(error)
                    result["error_msg"] = error[:200]

            except httpx.TimeoutException:
                result["latency_s"] = round(time.monotonic() - start, 2)
                result["error_type"] = "timeout"
                result["error_msg"] = f"No response in {PROMPT_TIMEOUT}s"
            except httpx.ConnectError as e:
                result["latency_s"] = round(time.monotonic() - start, 2)
                result["error_type"] = "connection_refused"
                result["error_msg"] = str(e)[:200]
            except Exception as e:
                result["latency_s"] = round(time.monotonic() - start, 2)
                result["error_type"] = f"unexpected:{type(e).__name__}"
                result["error_msg"] = str(e)[:200]

            results.append(result)

            status = "✅" if result["success"] else f"❌ {result['error_type']}"
            print(f"  Round {i+1:3d}: {status} | {result['latency_s']:6.1f}s | {result['response_len']:4d} chars | {result['prompt'][:35]}")

            # Small delay between requests to avoid overwhelming
            await asyncio.sleep(0.5)

    # Save + analyze
    output_path = "/home/climbing/openmate/acp-proxy/stability_test_results.json"
    summary = analyze_results(results)
    with open(output_path, "w") as f:
        json.dump({"summary": summary, "results": results}, f, ensure_ascii=False, indent=2)
    print(f"\n{'=' * 60}")
    print(f"结果已保存: {output_path}")
    print_summary(summary)
    return results


def classify_error(error_msg: str) -> str:
    """Classify error message into a type."""
    e = error_msg.lower()
    if "timeout" in e or "超时" in e:
        return "timeout"
    if "连接" in e or "connect" in e:
        return "connection_error"
    if "agent engine" in e or "soulmate" in e:
        return "agent_engine_error"
    if "session" in e:
        return "session_error"
    if "eof" in e or "closed" in e or "pipe" in e:
        return "process_died"
    return "other"


def analyze_results(results: list[dict]) -> dict:
    total = len(results)
    successes = [r for r in results if r["success"]]
    failures = [r for r in results if not r["success"]]

    error_types = {}
    for r in failures:
        et = r.get("error_type", "unknown")
        error_types[et] = error_types.get(et, 0) + 1

    latencies = [r["latency_s"] for r in successes]
    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    max_latency = max(latencies) if latencies else 0
    min_latency = min(latencies) if latencies else 0

    lengths = [r["response_len"] for r in successes]
    avg_len = sum(lengths) / len(lengths) if lengths else 0

    failure_rounds = [r["round"] for r in failures]

    # Find consecutive failure clusters
    fail_set = set(failure_rounds)
    clusters = []
    current_cluster = []
    for r in range(1, max(failure_rounds) + 1) if failure_rounds else []:
        if r in fail_set:
            current_cluster.append(r)
        else:
            if len(current_cluster) >= 2:
                clusters.append(current_cluster)
            current_cluster = []
    if len(current_cluster) >= 2:
        clusters.append(current_cluster)

    return {
        "total": total,
        "success": len(successes),
        "fail": len(failures),
        "success_rate": round(len(successes) / total * 100, 1) if total else 0,
        "error_types": error_types,
        "failure_rounds": failure_rounds,
        "failure_clusters": clusters,
        "latency_avg": round(avg_latency, 2),
        "latency_max": max_latency,
        "latency_min": min_latency,
        "response_len_avg": round(avg_len, 0),
    }


def print_summary(s: dict):
    print(f"\n{'=' * 60}")
    print("测试结果摘要")
    print(f"{'=' * 60}")
    print(f"  总轮次: {s['total']}")
    print(f"  成功: {s['success']} ({s['success_rate']}%)")
    print(f"  失败: {s['fail']}")
    print(f"  平均延迟: {s['latency_avg']}s")
    print(f"  延迟范围: {s['latency_min']}s ~ {s['latency_max']}s")
    print(f"  平均响应长度: {s['response_len_avg']} chars")
    if s["error_types"]:
        print(f"\n  错误类型分布:")
        for et, count in sorted(s["error_types"].items(), key=lambda x: -x[1]):
            print(f"    {et}: {count}次")
    if s["failure_rounds"]:
        print(f"\n  失败轮次: {s['failure_rounds'][:30]}{'...' if len(s['failure_rounds'])>30 else ''}")
    if s.get("failure_clusters"):
        print(f"\n  连续失败簇:")
        for cluster in s["failure_clusters"]:
            print(f"    Round {cluster[0]}-{cluster[-1]} ({len(cluster)}次连续失败)")


if __name__ == "__main__":
    results = asyncio.run(run_test())
    failed = sum(1 for r in results if not r["success"])
    print(f"\n退出: {failed} failures")
    sys.exit(0 if failed == 0 else 1)
