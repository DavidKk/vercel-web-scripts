export interface Config {
  id: string
}

export interface ConfigSchemaFCProps<T> {
  value: T
  onChange: (value: T) => void
  [key: string]: any
}

export type ConfigSchemaFC<T> = React.FC<ConfigSchemaFCProps<T>>

export type ConfigSchema<T> = Partial<{
  [K in keyof T]: ConfigSchemaFC<T[K]>
}>
