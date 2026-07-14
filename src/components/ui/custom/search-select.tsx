import { SearchSelectInput } from "@/components/ui/custom/search-select-input"

interface SearchSelectProps {
    id: string
    value: string
    options: string[]
    placeholder?: string
    onChange: (value: string) => void
}

function SearchSelect(props: SearchSelectProps) {
    return <SearchSelectInput {...props} allowCreate={false} />
}

export { SearchSelect }
