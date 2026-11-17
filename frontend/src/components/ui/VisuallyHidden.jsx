export function VisuallyHidden({ as: Tag = 'span', children, ...rest }) {
  return <Tag className="sr-only" {...rest}>{children}</Tag>;
}
