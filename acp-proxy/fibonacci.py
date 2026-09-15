#!/usr/bin/env python3
"""
斐波那契数列计算脚本
支持：
1. 计算第 n 项
2. 打印前 n 项
3. 命令行使用
"""

def fibonacci(n: int) -> int:
    """计算斐波那契数列的第 n 项（迭代法）"""
    if n <= 0:
        return 0
    if n == 1:
        return 1
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

def fibonacci_sequence(n: int) -> list[int]:
    """返回前 n 项的斐波那契数列"""
    if n <= 0:
        return []
    seq = [0, 1] if n >= 2 else [0]
    if n == 1:
        return [0]
    a, b = 0, 1
    for _ in range(2, n):
        a, b = b, a + b
        seq.append(b)
    return seq

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("用法：")
        print("  python fibonacci.py <n>        # 计算第 n 项")
        print("  python fibonacci.py seq <n>    # 打印前 n 项")
        sys.exit(1)
    
    if sys.argv[1] == "seq":
        if len(sys.argv) < 3:
            print("错误：需要提供数量 n")
            sys.exit(1)
        n = int(sys.argv[2])
        seq = fibonacci_sequence(n)
        print(f"前 {n} 项：{seq}")
    else:
        n = int(sys.argv[1])
        result = fibonacci(n)
        print(f"fibonacci({n}) = {result}")