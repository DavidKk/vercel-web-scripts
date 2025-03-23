import React, { useState, useRef, useEffect, useImperativeHandle } from 'react'
import { useRequest } from 'ahooks'
import { DndContext, useSensor, useSensors, closestCenter, PointerSensor, KeyboardSensor } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { PlusIcon, ArrowPathIcon, TrashIcon } from '@heroicons/react/24/solid'
import Alert, { type AlertImperativeHandler } from '@/components/Alert'
import { Spinner } from '@/components/Spinner'
import SortableItem from './SortableItem'
import { FilterBar } from './FilterBar'
import type { Config, ConfigSchema, ConfigSchemaFC } from './types'
import { fuzzySearch } from '@/utils/find'

export interface ConfigManagerProps<T extends Config> {
  configs: T[]
  configSchema: ConfigSchema<T>
  filterSchema?: ConfigSchema<T>
  onSubmit?: (configs: T[]) => Promise<void>
}

export interface ConfigManagerReference {
  prepend: (data?: Record<string, any>) => void
  remove: (id: string) => void
  reset: () => void
  submit: () => void
  submitting: boolean
}

export default React.forwardRef<ConfigManagerReference, ConfigManagerProps<any>>((props, ref) => {
  const { configs: defaultConfigs, configSchema, filterSchema, onSubmit } = props

  const [configs, setConfigs] = useState([...defaultConfigs])
  const [filteredConfigs, setFilteredConfigs] = useState(configs)

  const alertRef = useRef<AlertImperativeHandler>(null)
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))
  const formRef = useRef<HTMLFormElement>(null)

  const isFilterMode = filteredConfigs.length !== configs.length

  const handleDragEnd = (event: any) => {
    const { active, over } = event
    if (active.id !== over.id) {
      setConfigs((prev) =>
        arrayMove(
          prev,
          prev.findIndex((item) => item.id === active.id),
          prev.findIndex((item) => item.id === over.id)
        )
      )
    }
  }

  const uuid = () => {
    const uid = crypto.randomUUID()
    if (configs.some((item) => item.id === uid)) {
      return uuid()
    }

    return uid
  }

  const prependConfig = (index: number, data: Record<string, any> = {}) => {
    const id = uuid()
    const newConfig = { id, ...data } as Config

    setConfigs((prev) => {
      const cloned = [...prev]
      cloned.splice(index + 1, 0, newConfig)
      return cloned
    })

    setFilteredConfigs((prev) => {
      const cloned = [...prev]
      cloned.splice(index + 1, 0, newConfig)
      return cloned
    })
  }

  const prepend = (data: Record<string, any> = {}) => {
    prependConfig(0, data)
  }

  const remove = (id: string) => {
    if (!confirm(`Are you sure you want to remove this rule?`)) {
      return
    }

    setConfigs((prev) => prev.filter((item) => item.id !== id))
  }

  const reset = () => {
    setConfigs([...defaultConfigs])
    setFilteredConfigs([...defaultConfigs])
  }

  const handleFilter = (filterOptions: Omit<Config, 'id'>) => {
    const filteredConfigs = configs.filter((config) => {
      return Object.keys(filterOptions).some((field) => {
        if (!(field in config)) {
          return false
        }

        const match = (filterOptions as Record<string, unknown>)[field]
        const item = (config as Record<string, unknown>)[field]
        if (typeof item === 'string' && typeof match === 'string') {
          return fuzzySearch(match, item)
        }

        return match === item
      })
    })

    setFilteredConfigs(filteredConfigs)
  }

  const handleConfigChange = (id: string, field: string, value: any) => {
    setConfigs((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const { run: submit, loading: submitting } = useRequest(
    async () => {
      if (!formRef.current?.checkVisibility()) {
        formRef.current?.reportValidity()
        return
      }

      if (!onSubmit) {
        return
      }

      await onSubmit(configs)
    },
    {
      manual: true,
      debounceWait: 500,
      onSuccess: () => {
        alertRef.current?.show('Config saved successfully', {
          type: 'success',
        })
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : Object.prototype.toString.call(error)
        alertRef.current?.show(message, { type: 'error' })
      },
    }
  )

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()

    submit()
  }

  useImperativeHandle(ref, () => ({
    prepend,
    remove,
    reset,
    submit,
    submitting,
  }))

  useEffect(() => {
    if (!configs?.length) {
      prependConfig(0)
    }
  }, [configs])

  useEffect(() => {
    setFilteredConfigs([...configs])
  }, [configs?.length])

  const finalConfigs = isFilterMode ? filteredConfigs : configs

  const renderConfigs = (config: Config) => {
    const id = config.id
    return (
      <SortableItem id={id} key={id}>
        {Object.keys(configSchema).map((field, index) => {
          const value = field in config ? (config as any)[field] : ''
          const Component = configSchema[field as keyof Config] as ConfigSchemaFC<any>
          if (!Component) {
            return <React.Fragment key={index}>{value}</React.Fragment>
          }

          return <Component value={value} onChange={(value) => handleConfigChange(id, field, value)} key={index} />
        })}

        <button onClick={() => remove(id)} className="flex-basis h-8 text-sm bg-red-500 text-white rounded-sm hover:bg-red-600 px-4" aria-label="Remove config" type="button">
          <TrashIcon className="h-4 w-4 text-white" />
        </button>
      </SortableItem>
    )
  }

  const renderFormFields = () => {
    if (!finalConfigs?.length) {
      return <div className="w-full flex items-center justify-center border rounded-sm shadow bg-white py-6">No configs</div>
    }

    return finalConfigs.map((config) => (
      <div className="flex" key={config.id}>
        {renderConfigs(config)}
      </div>
    ))
  }

  return (
    <form onSubmit={handleSubmit} ref={formRef}>
      {filterSchema ? <FilterBar schema={filterSchema} onFilter={handleFilter} /> : null}

      <div className="mx-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={configs.map((config) => config.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">{renderFormFields()}</div>
          </SortableContext>
        </DndContext>
      </div>

      <footer className="flex gap-2 mt-4">
        <div className="flex flex-col flex-grow">
          <Alert ref={alertRef} />
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => prependConfig(configs.length)}
            className="px-4 py-2 bg-indigo-500 cursor-pointer text-sm text-white rounded-sm hover:bg-indigo-600"
            type="button"
            aria-label="Add Config"
            title="Add Config"
          >
            <PlusIcon className="h-5 w-5" />
          </button>

          <button onClick={reset} className="px-4 py-2 bg-gray-500 cursor-pointer text-sm text-white rounded-sm hover:bg-gray-600" type="button" aria-label="Reset" title="Reset">
            <ArrowPathIcon className="h-5 w-5" />
          </button>

          <button
            disabled={submitting}
            className="px-4 py-2 bg-green-500 cursor-pointer text-sm text-white rounded-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            type="submit"
            aria-label="Save"
            title="Save"
          >
            {submitting ? (
              <span className="w-5 h-5 flex flex-row items-center">
                <Spinner />
              </span>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </footer>
    </form>
  )
})
