"""
Config v1.0 配置中心模块。

提供四层命名空间（cluster→project→service→instance）的配置管理能力：
- 配置项的增删改查
- 版本管理与历史回滚
- 热更新通知（订阅者模式）
- 敏感配置加密标记
- 通配符命名空间查询

使用示例：
    from config_center import ConfigStore, ConfigItem

    store = ConfigStore.get_instance()
    store.set("prod/myproject/api-server", "db_host", "10.0.0.1")
    item = store.get("prod/myproject/api-server", "db_host")
"""

from .models import ConfigAction, ConfigChange, ConfigItem, validate_namespace
from .store import ConfigStore

__all__ = [
    "ConfigStore",
    "ConfigItem",
    "ConfigChange",
    "ConfigAction",
    "validate_namespace",
]

__version__ = "1.0.0"
