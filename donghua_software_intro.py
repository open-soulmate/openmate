#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
东华软件股份公司介绍PPT生成器
设计风格：高科技企业风格
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import datetime

class DonghuaSoftwarePPT:
    def __init__(self):
        self.prs = Presentation()
        self.prs.slide_width = Inches(13.333)
        self.prs.slide_height = Inches(7.5)
        
        # 颜色方案 - 高科技风格
        self.colors = {
            'primary': RGBColor(0, 51, 102),      # 深蓝色
            'secondary': RGBColor(0, 102, 153),   # 中蓝色
            'accent': RGBColor(0, 153, 204),      # 亮蓝色
            'light': RGBColor(204, 229, 255),     # 浅蓝色
            'white': RGBColor(255, 255, 255),
            'black': RGBColor(0, 0, 0),
            'gray': RGBColor(128, 128, 128),
            'light_gray': RGBColor(240, 240, 240),
            'highlight': RGBColor(255, 102, 0),   # 橙色高亮
        }
        
    def add_background(self, slide, color=None):
        """添加背景"""
        if color is None:
            color = self.colors['white']
        
        background = slide.background
        fill = background.fill
        fill.solid()
        fill.fore_color.rgb = color
    
    def add_shape(self, slide, left, top, width, height, color, shape_type=MSO_SHAPE.RECTANGLE):
        """添加形状"""
        shape = slide.shapes.add_shape(shape_type, left, top, width, height)
        shape.fill.solid()
        shape.fill.fore_color.rgb = color
        shape.line.fill.background()
        return shape
    
    def add_text_box(self, slide, left, top, width, height, text, font_size=18, 
                     color=None, bold=False, alignment=PP_ALIGN.LEFT, font_name='微软雅黑'):
        """添加文本框"""
        if color is None:
            color = self.colors['black']
            
        txBox = slide.shapes.add_textbox(left, top, width, height)
        tf = txBox.text_frame
        tf.word_wrap = True
        
        p = tf.paragraphs[0]
        p.text = text
        p.font.size = Pt(font_size)
        p.font.color.rgb = color
        p.font.bold = bold
        p.font.name = font_name
        p.alignment = alignment
        
        return txBox
    
    def create_cover_slide(self):
        """封面幻灯片"""
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])  # 空白布局
        
        # 背景 - 深蓝色渐变
        self.add_background(slide, self.colors['primary'])
        
        # 装饰元素 - 左侧渐变条
        self.add_shape(slide, Inches(0), Inches(0), Inches(0.5), self.prs.slide_height, 
                      self.colors['accent'])
        
        # 装饰元素 - 右上角圆形
        self.add_shape(slide, Inches(10), Inches(0.5), Inches(2), Inches(2), 
                      self.colors['secondary'], MSO_SHAPE.OVAL)
        
        # 装饰元素 - 右下角小圆
        self.add_shape(slide, Inches(11), Inches(5), Inches(1), Inches(1), 
                      self.colors['accent'], MSO_SHAPE.OVAL)
        
        # 公司名称
        self.add_text_box(slide, Inches(2), Inches(1.5), Inches(8), Inches(1.5),
                         "东华软件股份公司", font_size=48, color=self.colors['white'], 
                         bold=True, alignment=PP_ALIGN.LEFT)
        
        # 项目名称
        self.add_text_box(slide, Inches(2), Inches(3), Inches(8), Inches(1),
                         "OpenSoulMate 项目介绍", font_size=36, 
                         color=self.colors['light'], bold=False, alignment=PP_ALIGN.LEFT)
        
        # 副标题
        self.add_text_box(slide, Inches(2), Inches(4.5), Inches(8), Inches(1),
                         "AI驱动的智能解决方案", font_size=24, 
                         color=self.colors['accent'], bold=False, alignment=PP_ALIGN.LEFT)
        
        # 日期信息
        today = datetime.date.today()
        date_str = today.strftime("%Y年%m月%d日")
        self.add_text_box(slide, Inches(2), Inches(6), Inches(8), Inches(0.8),
                         date_str, font_size=16, color=self.colors['light'], 
                         bold=False, alignment=PP_ALIGN.LEFT)
        
        # 底部装饰线
        self.add_shape(slide, Inches(2), Inches(5.8), Inches(8), Inches(0.05), 
                      self.colors['accent'])
    
    def create_company_intro_slide(self):
        """公司简介幻灯片"""
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        
        # 背景
        self.add_background(slide, self.colors['white'])
        
        # 左侧装饰条
        self.add_shape(slide, Inches(0), Inches(0), Inches(0.15), self.prs.slide_height, 
                      self.colors['primary'])
        
        # 标题
        self.add_text_box(slide, Inches(0.5), Inches(0.5), Inches(12), Inches(1),
                         "公司简介", font_size=36, color=self.colors['primary'], 
                         bold=True, alignment=PP_ALIGN.LEFT)
        
        # 标题下划线
        self.add_shape(slide, Inches(0.5), Inches(1.5), Inches(2), Inches(0.05), 
                      self.colors['accent'])
        
        # 公司简介内容
        intro_text = """东华软件股份公司（股票代码：002065）是中国领先的软件与信息技术服务提供商，成立于2001年，总部位于北京。

公司专注于为金融、医疗、政务、能源等行业提供全方位的软件开发、系统集成和IT服务解决方案。

东华软件秉承"创新、务实、合作、共赢"的企业理念，致力于成为全球领先的数字化转型服务提供商。"""
        
        self.add_text_box(slide, Inches(0.8), Inches(2), Inches(6), Inches(4),
                         intro_text, font_size=18, color=self.colors['black'], 
                         bold=False, alignment=PP_ALIGN.LEFT)
        
        # 右侧关键指标
        metrics = [
            ("成立时间", "2001年"),
            ("员工规模", "10,000+"),
            ("服务客户", "2,000+"),
            ("行业覆盖", "金融、医疗、政务、能源等"),
            ("分支机构", "全国30+城市"),
        ]
        
        y_position = 2
        for metric, value in metrics:
            # 指标标签
            self.add_text_box(slide, Inches(8), Inches(y_position), Inches(2), Inches(0.5),
                             metric, font_size=16, color=self.colors['secondary'], 
                             bold=True, alignment=PP_ALIGN.LEFT)
            
            # 指标值
            self.add_text_box(slide, Inches(10), Inches(y_position), Inches(2), Inches(0.5),
                             value, font_size=16, color=self.colors['black'], 
                             bold=False, alignment=PP_ALIGN.LEFT)
            
            # 分隔线
            self.add_shape(slide, Inches(8), Inches(y_position + 0.6), Inches(4), 
                          Inches(0.02), self.colors['light'])
            y_position += 0.8
    
    def create_business_slide(self):
        """核心业务幻灯片"""
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        
        # 背景
        self.add_background(slide, self.colors['light_gray'])
        
        # 左侧装饰条
        self.add_shape(slide, Inches(0), Inches(0), Inches(0.15), self.prs.slide_height, 
                      self.colors['primary'])
        
        # 标题
        self.add_text_box(slide, Inches(0.5), Inches(0.5), Inches(12), Inches(1),
                         "核心业务领域", font_size=36, color=self.colors['primary'], 
                         bold=True, alignment=PP_ALIGN.LEFT)
        
        # 标题下划线
        self.add_shape(slide, Inches(0.5), Inches(1.5), Inches(2), Inches(0.05), 
                      self.colors['accent'])
        
        # 业务领域卡片
        businesses = [
            ("金融科技", "银行核心系统、风险管控、移动金融、数字货币解决方案"),
            ("医疗健康", "智慧医院、区域医疗、健康管理、医疗大数据平台"),
            ("智慧政务", "数字政府、智慧城市、政务云、数据共享平台"),
            ("能源电力", "智能电网、能源管理、电力信息化、新能源解决方案"),
            ("人工智能", "AI平台、机器学习、自然语言处理、计算机视觉"),
            ("云计算服务", "混合云、私有云、云迁移、云安全服务"),
        ]
        
        x_positions = [0.8, 4.5, 8.2, 0.8, 4.5, 8.2]
        y_positions = [2, 2, 2, 4.5, 4.5, 4.5]
        
        for i, (title, description) in enumerate(businesses):
            # 业务卡片背景
            card = self.add_shape(slide, Inches(x_positions[i]), Inches(y_positions[i]), 
                                 Inches(3.5), Inches(2), self.colors['white'])
            
            # 卡片顶部装饰条
            self.add_shape(slide, Inches(x_positions[i]), Inches(y_positions[i]), 
                          Inches(3.5), Inches(0.1), self.colors['accent'])
            
            # 业务标题
            self.add_text_box(slide, Inches(x_positions[i] + 0.2), 
                             Inches(y_positions[i] + 0.3), Inches(3), Inches(0.5),
                             title, font_size=20, color=self.colors['primary'], 
                             bold=True, alignment=PP_ALIGN.LEFT)
            
            # 业务描述
            self.add_text_box(slide, Inches(x_positions[i] + 0.2), 
                             Inches(y_positions[i] + 0.9), Inches(3), Inches(1),
                             description, font_size=14, color=self.colors['gray'], 
                             bold=False, alignment=PP_ALIGN.LEFT)
    
    def create_opensoulmate_slide(self):
        """OpenSoulMate项目介绍幻灯片"""
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        
        # 背景
        self.add_background(slide, self.colors['white'])
        
        # 左侧装饰条
        self.add_shape(slide, Inches(0), Inches(0), Inches(0.15), self.prs.slide_height, 
                      self.colors['primary'])
        
        # 标题
        self.add_text_box(slide, Inches(0.5), Inches(0.5), Inches(12), Inches(1),
                         "OpenSoulMate 项目介绍", font_size=36, color=self.colors['primary'], 
                         bold=True, alignment=PP_ALIGN.LEFT)
        
        # 标题下划线
        self.add_shape(slide, Inches(0.5), Inches(1.5), Inches(2), Inches(0.05), 
                      self.colors['accent'])
        
        # 项目介绍
        project_intro = """OpenSoulMate是东华软件自主研发的新一代AI智能助手平台，基于先进的大语言模型技术，为企业和个人用户提供智能化的交互体验。

该项目由我主导开发，融合了自然语言处理、机器学习、知识图谱等前沿技术，旨在打造最懂用户需求的智能助手。"""
        
        self.add_text_box(slide, Inches(0.8), Inches(2), Inches(7), Inches(2),
                         project_intro, font_size=18, color=self.colors['black'], 
                         bold=False, alignment=PP_ALIGN.LEFT)
        
        # 核心功能
        features = [
            "多模态交互：支持文本、语音、图像等多种输入方式",
            "智能推理：具备复杂问题分析和逻辑推理能力",
            "知识整合：融合企业知识库，提供精准专业建议",
            "个性化服务：根据用户偏好提供定制化服务",
            "安全可靠：企业级数据安全和隐私保护",
        ]
        
        self.add_text_box(slide, Inches(0.8), Inches(4), Inches(7), Inches(0.5),
                         "核心功能特性", font_size=20, color=self.colors['secondary'], 
                         bold=True, alignment=PP_ALIGN.LEFT)
        
        y_position = 4.6
        for feature in features:
            # 功能点
            self.add_text_box(slide, Inches(1.2), Inches(y_position), Inches(6), Inches(0.4),
                             "• " + feature, font_size=16, color=self.colors['black'], 
                             bold=False, alignment=PP_ALIGN.LEFT)
            y_position += 0.4
        
        # 右侧项目亮点
        highlights = [
            ("开发周期", "6个月"),
            ("代码规模", "50,000+行"),
            ("技术栈", "Python, Next.js, AI模型"),
            ("部署方式", "私有化/云端双模"),
            ("服务模式", "7×24小时智能响应"),
        ]
        
        # 亮点卡片背景
        self.add_shape(slide, Inches(8.5), Inches(2), Inches(4), Inches(4.5), 
                      self.colors['light'])
        
        self.add_text_box(slide, Inches(8.8), Inches(2.2), Inches(3.5), Inches(0.5),
                         "项目亮点", font_size=20, color=self.colors['primary'], 
                         bold=True, alignment=PP_ALIGN.CENTER)
        
        y_position = 2.8
        for highlight, value in highlights:
            # 亮点标签
            self.add_text_box(slide, Inches(8.8), Inches(y_position), Inches(2), Inches(0.4),
                             highlight, font_size=14, color=self.colors['secondary'], 
                             bold=True, alignment=PP_ALIGN.LEFT)
            
            # 亮点值
            self.add_text_box(slide, Inches(10.8), Inches(y_position), Inches(1.5), Inches(0.4),
                             value, font_size=14, color=self.colors['black'], 
                             bold=False, alignment=PP_ALIGN.LEFT)
            
            # 分隔线
            self.add_shape(slide, Inches(8.8), Inches(y_position + 0.4), Inches(3), 
                          Inches(0.02), self.colors['light'])
            y_position += 0.5
    
    def create_architecture_slide(self):
        """技术架构幻灯片"""
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        
        # 背景
        self.add_background(slide, self.colors['white'])
        
        # 左侧装饰条
        self.add_shape(slide, Inches(0), Inches(0), Inches(0.15), self.prs.slide_height, 
                      self.colors['primary'])
        
        # 标题
        self.add_text_box(slide, Inches(0.5), Inches(0.5), Inches(12), Inches(1),
                         "技术架构", font_size=36, color=self.colors['primary'], 
                         bold=True, alignment=PP_ALIGN.LEFT)
        
        # 标题下划线
        self.add_shape(slide, Inches(0.5), Inches(1.5), Inches(2), Inches(0.05), 
                      self.colors['accent'])
        
        # 架构层次
        layers = [
            ("表现层", "Next.js + React + TypeScript", "响应式Web界面，支持多终端适配"),
            ("应用层", "FastAPI + WebSocket", "RESTful API，实时通信服务"),
            ("核心层", "AI Agent + LLM Engine", "智能推理，任务规划，多模型调度"),
            ("数据层", "PostgreSQL + Redis + Vector DB", "结构化存储，缓存加速，向量检索"),
            ("基础设施层", "Docker + Kubernetes", "容器化部署，弹性扩缩容"),
        ]
        
        y_position = 2
        for i, (layer_name, tech, description) in enumerate(layers):
            # 层名称标签
            layer_color = self.colors['primary'] if i % 2 == 0 else self.colors['secondary']
            self.add_shape(slide, Inches(1), Inches(y_position), Inches(2), Inches(0.8), 
                          layer_color)
            self.add_text_box(slide, Inches(1.1), Inches(y_position + 0.2), Inches(1.8), Inches(0.4),
                             layer_name, font_size=16, color=self.colors['white'], 
                             bold=True, alignment=PP_ALIGN.CENTER)
            
            # 技术栈
            self.add_text_box(slide, Inches(3.2), Inches(y_position + 0.1), Inches(4), Inches(0.3),
                             tech, font_size=14, color=self.colors['primary'], 
                             bold=True, alignment=PP_ALIGN.LEFT)
            
            # 描述
            self.add_text_box(slide, Inches(3.2), Inches(y_position + 0.4), Inches(4), Inches(0.3),
                             description, font_size=12, color=self.colors['gray'], 
                             bold=False, alignment=PP_ALIGN.LEFT)
            
            # 连接箭头（除了最后一层）
            if i < len(layers) - 1:
                self.add_shape(slide, Inches(2), Inches(y_position + 0.8), 
                              Inches(0.1), Inches(0.3), self.colors['accent'])
            
            y_position += 1.2
        
        # 右侧技术优势
        advantages = [
            "模块化设计，易于扩展",
            "微服务架构，高可用性",
            "AI模型热插拔",
            "多租户支持",
            "完整的安全防护",
        ]
        
        self.add_text_box(slide, Inches(8), Inches(2), Inches(4), Inches(0.5),
                         "技术优势", font_size=20, color=self.colors['primary'], 
                         bold=True, alignment=PP_ALIGN.LEFT)
        
        y_position = 2.8
        for advantage in advantages:
            self.add_text_box(slide, Inches(8), Inches(y_position), Inches(4), Inches(0.4),
                             "✓ " + advantage, font_size=16, color=self.colors['black'], 
                             bold=False, alignment=PP_ALIGN.LEFT)
            y_position += 0.5
    
    def create_future_slide(self):
        """未来展望幻灯片"""
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        
        # 背景 - 深蓝色
        self.add_background(slide, self.colors['primary'])
        
        # 装饰元素
        self.add_shape(slide, Inches(0), Inches(0), Inches(0.5), self.prs.slide_height, 
                      self.colors['accent'])
        
        # 标题
        self.add_text_box(slide, Inches(2), Inches(1), Inches(9), Inches(1),
                         "未来展望", font_size=36, color=self.colors['white'], 
                         bold=True, alignment=PP_ALIGN.LEFT)
        
        # 标题下划线
        self.add_shape(slide, Inches(2), Inches(2), Inches(2), Inches(0.05), 
                      self.colors['accent'])
        
        # 展望内容
        vision_items = [
            ("技术深耕", "持续投入AI研发，保持技术领先优势"),
            ("生态建设", "构建开放平台，与合作伙伴共建AI生态"),
            ("行业拓展", "深入垂直行业，提供专业化解决方案"),
            ("国际化", "拓展海外市场，打造国际竞争力"),
            ("人才培养", "加强AI人才储备，建设顶尖研发团队"),
        ]
        
        y_position = 2.5
        for i, (title, description) in enumerate(vision_items):
            # 序号圆圈
            self.add_shape(slide, Inches(2), Inches(y_position), Inches(0.6), Inches(0.6), 
                          self.colors['accent'], MSO_SHAPE.OVAL)
            self.add_text_box(slide, Inches(2.1), Inches(y_position + 0.1), Inches(0.4), Inches(0.4),
                             str(i+1), font_size=18, color=self.colors['white'], 
                             bold=True, alignment=PP_ALIGN.CENTER)
            
            # 标题
            self.add_text_box(slide, Inches(3), Inches(y_position + 0.05), Inches(3), Inches(0.3),
                             title, font_size=20, color=self.colors['white'], 
                             bold=True, alignment=PP_ALIGN.LEFT)
            
            # 描述
            self.add_text_box(slide, Inches(3), Inches(y_position + 0.4), Inches(6), Inches(0.3),
                             description, font_size=16, color=self.colors['light'], 
                             bold=False, alignment=PP_ALIGN.LEFT)
            
            y_position += 0.9
        
        # 底部口号
        self.add_text_box(slide, Inches(2), Inches(6.5), Inches(9), Inches(0.8),
                         "东华软件 - 数字化转型的可靠伙伴", font_size=24, 
                         color=self.colors['accent'], bold=True, alignment=PP_ALIGN.CENTER)
    
    def create_contact_slide(self):
        """联系方式幻灯片"""
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        
        # 背景
        self.add_background(slide, self.colors['white'])
        
        # 左侧装饰条
        self.add_shape(slide, Inches(0), Inches(0), Inches(0.15), self.prs.slide_height, 
                      self.colors['primary'])
        
        # 标题
        self.add_text_box(slide, Inches(0.5), Inches(0.5), Inches(12), Inches(1),
                         "联系我们", font_size=36, color=self.colors['primary'], 
                         bold=True, alignment=PP_ALIGN.LEFT)
        
        # 标题下划线
        self.add_shape(slide, Inches(0.5), Inches(1.5), Inches(2), Inches(0.05), 
                      self.colors['accent'])
        
        # 联系信息
        contact_info = [
            ("公司地址", "北京市海淀区中关村软件园二期"),
            ("联系电话", "+86 10-88888888"),
            ("电子邮件", "contact@donghua.com"),
            ("官方网站", "www.donghua.com"),
            ("项目联系", "OpenSoulMate项目组"),
        ]
        
        y_position = 2.5
        for i, (title, info) in enumerate(contact_info):
            # 图标占位
            self.add_shape(slide, Inches(1), Inches(y_position), Inches(0.5), Inches(0.5), 
                          self.colors['accent'], MSO_SHAPE.ROUNDED_RECTANGLE)
            
            # 标题
            self.add_text_box(slide, Inches(2), Inches(y_position), Inches(2), Inches(0.4),
                             title, font_size=18, color=self.colors['primary'], 
                             bold=True, alignment=PP_ALIGN.LEFT)
            
            # 信息
            self.add_text_box(slide, Inches(4), Inches(y_position), Inches(6), Inches(0.4),
                             info, font_size=16, color=self.colors['black'], 
                             bold=False, alignment=PP_ALIGN.LEFT)
            
            # 分隔线
            if i < len(contact_info) - 1:
                self.add_shape(slide, Inches(1), Inches(y_position + 0.6), Inches(8), 
                              Inches(0.02), self.colors['light'])
            
            y_position += 0.8
        
        # 底部版权信息
        today = datetime.date.today()
        year = today.year
        self.add_text_box(slide, Inches(1), Inches(6.5), Inches(10), Inches(0.5),
                         f"© {year} 东华软件股份公司 版权所有", font_size=12, 
                         color=self.colors['gray'], bold=False, alignment=PP_ALIGN.CENTER)
    
    def generate_ppt(self, filename="东华软件_OpenSoulMate项目介绍.pptx"):
        """生成PPT文件"""
        # 创建所有幻灯片
        self.create_cover_slide()
        self.create_company_intro_slide()
        self.create_business_slide()
        self.create_opensoulmate_slide()
        self.create_architecture_slide()
        self.create_future_slide()
        self.create_contact_slide()
        
        # 保存文件
        self.prs.save(filename)
        print(f"PPT文件已生成: {filename}")
        return filename

if __name__ == "__main__":
    # 生成PPT
    ppt_generator = DonghuaSoftwarePPT()
    output_file = ppt_generator.generate_ppt("/home/climbing/openmate/东华软件_OpenSoulMate项目介绍.pptx")
    print(f"生成完成！文件路径: {output_file}")