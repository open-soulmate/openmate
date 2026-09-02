'use client';
/**
 * ACP审批弹窗组件 — human.approval.required事件触发
 *
 * 当Agent引擎执行高危操作（shell命令、文件删除、浏览器操作等）时，
 * 前端通过WebSocket收到human.approval.required事件，弹出此模态框
 * 让用户确认是否批准该操作。
 *
 * 点击"批准"或"拒绝"后，发送session/approval回传给Agent Engine。
 */

import { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';

// 审批请求数据结构（对应ACP v1.0 human.approval.required payload）
export interface AcpApprovalRequest {
  request_id: string;       // 审批请求唯一ID（如 apr-xxxx）
  tool_name: string;        // 工具名称（browser | shell | write_file | delete_file）
  risk_level: string;       // 风险等级（low | medium | high）
  description: string;      // 即将执行的操作说明
}

// 组件Props
interface AcpApprovalModalProps {
  request: AcpApprovalRequest | null;  // 当前审批请求，null则不显示
  onApprove: (requestId: string, comment: string) => void;  // 批准回调
  onReject: (requestId: string, comment: string) => void;   // 拒绝回调
  onClose: () => void;  // 关闭弹窗（审批完成后自动调用）
}

// 风险等级对应的颜色和图标配置
const RISK_CONFIG: Record<string, { color: string; bgColor: string; borderColor: string; label: string; labelKey: string }> = {
  low: {
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    label: '低风险',
    labelKey: '低风险',
  },
  medium: {
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    label: '中风险',
    labelKey: '中风险',
  },
  high: {
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    label: '高风险',
    labelKey: '高风险',
  },
};

// 工具名称对应的中文标签
const TOOL_LABELS: Record<string, string> = {
  browser: '浏览器操作',
  shell: 'Shell命令执行',
  write_file: '文件写入',
  delete_file: '文件删除',
};

export function AcpApprovalModal({ request, onApprove, onReject, onClose }: AcpApprovalModalProps) {
  const [comment, setComment] = useState('');        // 用户备注（可选）
  const [submitting, setSubmitting] = useState(false); // 提交中状态
  const [result, setResult] = useState<'approve' | 'reject' | null>(null); // 审批结果

  // 请求变化时重置状态
  useEffect(() => {
    setComment('');
    setSubmitting(false);
    setResult(null);
  }, [request?.request_id]);

  // 审批完成后自动关闭（延迟1.2秒让用户看到结果反馈）
  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => {
        onClose();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [result, onClose]);

  // 处理批准操作
  const handleApprove = useCallback(() => {
    if (!request || submitting) return;
    setSubmitting(true);
    setResult('approve');
    onApprove(request.request_id, comment);
  }, [request, submitting, comment, onApprove]);

  // 处理拒绝操作
  const handleReject = useCallback(() => {
    if (!request || submitting) return;
    setSubmitting(true);
    setResult('reject');
    onReject(request.request_id, comment);
  }, [request, submitting, comment, onReject]);

  // ESC键关闭（仅在提交前有效）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    if (request) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [request, submitting, onClose]);

  // 无请求时不渲染
  if (!request) return null;

  const riskConfig = RISK_CONFIG[request.risk_level] || RISK_CONFIG.medium;
  const toolLabel = TOOL_LABELS[request.tool_name] || request.tool_name;

  return (
    // 遮罩层 — 半透明黑色背景，点击不关闭（审批必须显式操作）
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {/* 弹窗主体 */}
      <div className="relative w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* ── 顶部风险标识条 ── */}
        <div className={`flex items-center gap-2 px-5 py-3 ${riskConfig.bgColor} border-b ${riskConfig.borderColor}`}>
          <Shield className={`w-4 h-4 ${riskConfig.color}`} />
          <span className={`text-sm font-semibold ${riskConfig.color}`}>
            安全审批 · {riskConfig.label}
          </span>
          <span className="ml-auto text-xs text-muted-foreground font-mono">
            {request.request_id}
          </span>
        </div>

        {/* ── 内容区域 ── */}
        <div className="px-5 py-4 space-y-4">

          {/* 审批结果反馈（提交后显示） */}
          {result && (
            <div className={`flex flex-col items-center gap-3 py-6 ${result === 'approve' ? 'text-green-500' : 'text-red-500'}`}>
              {result === 'approve' ? (
                <CheckCircle className="w-12 h-12" />
              ) : (
                <XCircle className="w-12 h-12" />
              )}
              <span className="text-lg font-semibold">
                {result === 'approve' ? '已批准' : '已拒绝'}
              </span>
            </div>
          )}

          {/* 审批表单（提交前显示） */}
          {!result && (
            <>
              {/* 工具名称 */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16 shrink-0">工具</span>
                <span className="text-sm font-medium bg-muted px-2.5 py-1 rounded-md">
                  {toolLabel}
                </span>
              </div>

              {/* 风险等级 */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16 shrink-0">风险</span>
                <span className={`text-sm font-medium px-2.5 py-1 rounded-md ${riskConfig.bgColor} ${riskConfig.color}`}>
                  {riskConfig.label}
                </span>
              </div>

              {/* 操作描述 */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">操作说明</span>
                <div className="text-sm bg-muted/50 border border-border rounded-lg p-3 leading-relaxed max-h-32 overflow-y-auto">
                  {request.description || '（无详细说明）'}
                </div>
              </div>

              {/* 高风险警告 */}
              {request.risk_level === 'high' && (
                <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>此操作风险较高，请仔细确认后再批准。拒绝后Agent将跳过此操作。</span>
                </div>
              )}

              {/* 用户备注（可选） */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">备注（可选）</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="输入审批备注..."
                  rows={2}
                  className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:border-primary/50 resize-none transition-colors"
                />
              </div>
            </>
          )}
        </div>

        {/* ── 底部操作按钮（提交前显示） ── */}
        {!result && (
          <div className="flex items-center gap-3 px-5 py-4 border-t border-border bg-muted/30">
            <button
              onClick={handleReject}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-border bg-card hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 disabled:opacity-50 transition-all"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              拒绝
            </button>
            <button
              onClick={handleApprove}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              批准
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
