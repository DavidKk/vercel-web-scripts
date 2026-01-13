import { useEffect, useState } from 'react'
import { FiDelete } from 'react-icons/fi'

import { fuzzySearch } from '@/utils/find'

export interface FilterBarItems {
  name: string
}

export interface FilterBarProps<T extends FilterBarItems> {
  configs: T[]
  onFilter: (configs: T[]) => void
}

export function FilterBar<T extends FilterBarItems>(props: FilterBarProps<T>) {
  const { configs, onFilter } = props
  const [nameFilter, setNameFilter] = useState('')

  useEffect(() => {
    const filteredConfigs = configs.filter((config) => {
      if (nameFilter) {
        if (!('name' in config)) {
          return false
        }

        return fuzzySearch(nameFilter, config.name)
      }

      return true
    })

    onFilter(filteredConfigs)
  }, [configs, nameFilter, onFilter])

  return (
    <div className="flex gap-2 justify-start sm:justify-end overflow-x-auto mb-2 p-2 sm:pb-2 bg-gray-100 rounded-sm shadow-md">
      <input
        type="text"
        placeholder="Filter by name"
        className="h-8 text-sm border rounded-sm box-border px-3"
        value={nameFilter}
        onChange={(event) => setNameFilter(event.target.value)}
      />

      <button className="h-8 flex items-center justify-center text-sm border-gray-300 border rounded-sm box-border px-3" onClick={() => setNameFilter('')} type="button">
        <FiDelete className="h-4 w-4 text-gray-500" />
      </button>
    </div>
  )
}
