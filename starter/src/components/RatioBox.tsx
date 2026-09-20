/**
 * 比例占位容器：图片加载前依据数据中的真实 width/height 撑开空间，
 * 避免布局抖动（CLS，task.md 约束 3）。
 */
import type { CSSProperties, ReactNode } from 'react'

export function RatioBox({
  width,
  height,
  className,
  children,
  style,
}: {
  width: number
  height: number
  className?: string
  children?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      className={className ? `ratio-box ${className}` : 'ratio-box'}
      style={{
        position: 'relative',
        width: '100%',
        paddingTop: `${(height / width) * 100}%`,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
