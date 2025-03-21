export interface WildcardFieldProps {
  value: string
  onChange: (value: string) => void
}

export const WildcardField: React.FC<WildcardFieldProps> = (props) => {
  const { value, onChange } = props
  return (
    <input
      className="h-8 text-sm border rounded-sm box-border px-3"
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Enter url wildcard. e.g. *://*.example.com/*"
    />
  )
}
