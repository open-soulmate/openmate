# pytest包标记：使 `from tests.test_steering import ...` 跨模块import可解析。
# 无此文件时opensoul/.venv的editable install把/home/climbing/opensoul加进
# sys.path，opensoul/tests/(regular package)遮蔽acp-proxy/tests/(namespace)，
# 4个wiring测试collection报ModuleNotFoundError: tests.test_steering。
