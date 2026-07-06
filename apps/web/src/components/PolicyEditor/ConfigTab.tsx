import { useEffect, useRef, useState } from 'react'
import { Check, Download, FileUp, RefreshCw, Upload } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Текстовый редактор полной конфигурации политики (JSON).
// Экспорт/импорт того же формата — перенос политик между окружениями и бэкап.

interface ConfigTabProps {
  policyId: string
  policyName: string
}

interface ImportResult {
  settingsApplied: number
  listRowsApplied: number
  devicesApplied: number
  unknownParameters: string[]
  unknownLists: string[]
  unknownDevices: string[]
}

export function ConfigTab({ policyId, policyName }: ConfigTabProps) {
  const { data: config, refetch, isFetching } = trpc.policies.exportConfig.useQuery({ policyId })
  const importConfig = trpc.policies.importConfig.useMutation()
  const utils = trpc.useUtils()

  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (config && !dirty) setText(JSON.stringify(config, null, 2))
  }, [config, dirty])

  function validate(): unknown | null {
    try {
      const parsed: unknown = JSON.parse(text)
      setParseError(null)
      return parsed
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Некорректный JSON')
      return null
    }
  }

  function apply() {
    const parsed = validate()
    if (!parsed) return
    setResult(null)
    importConfig.mutate(
      { policyId, config: parsed as Parameters<typeof importConfig.mutate>[0]['config'], replace: true },
      {
        onSuccess: r => {
          setResult(r as ImportResult)
          setDirty(false)
          void utils.policies.get.invalidate({ policyId })
          void utils.policies.resolveEffective.invalidate({ policyId })
          void utils.policies.listRows.invalidate()
          void utils.policies.listRowCounts.invalidate({ policyId })
          void utils.policies.listDeviceSettings.invalidate({ policyId })
          void refetch()
        },
        onError: e => setParseError(e.message),
      },
    )
  }

  function download() {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `policy_${policyName.replace(/[^\wа-яё-]+/giu, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function uploadFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result ?? ''))
      setDirty(true)
      setParseError(null)
      setResult(null)
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => { setDirty(false); void refetch() }}>
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Перечитать из БД
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={validate}>
          <Check className="h-3.5 w-3.5" />
          Проверить JSON
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={download}>
          <Download className="h-3.5 w-3.5" />
          Скачать
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => fileInput.current?.click()}>
          <FileUp className="h-3.5 w-3.5" />
          Загрузить из файла
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) uploadFile(f)
            e.target.value = ''
          }}
        />
        <div className="flex-1" />
        <Button size="sm" className="h-8 gap-1.5" disabled={importConfig.isPending} onClick={apply}>
          <Upload className="h-3.5 w-3.5" />
          Применить к политике
        </Button>
      </div>

      {parseError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {parseError}
        </div>
      )}

      {result && (
        <div className="space-y-1 rounded-md border border-green-600/30 bg-green-500/10 px-3 py-2 text-xs">
          <div className="font-medium text-green-700">
            Применено: параметров — {result.settingsApplied}, строк списков — {result.listRowsApplied},
            устройств — {result.devicesApplied}
          </div>
          {result.unknownParameters.length > 0 && (
            <div className="text-amber-700">
              Не распознаны параметры ({result.unknownParameters.length}): {result.unknownParameters.slice(0, 5).join('; ')}
              {result.unknownParameters.length > 5 && '…'}
            </div>
          )}
          {result.unknownLists.length > 0 && (
            <div className="text-amber-700">Не распознаны списки: {result.unknownLists.join('; ')}</div>
          )}
          {result.unknownDevices.length > 0 && (
            <div className="text-amber-700">Не распознаны типы устройств: {result.unknownDevices.join('; ')}</div>
          )}
        </div>
      )}

      <textarea
        className={cn(
          'h-[32rem] w-full resize-y rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          parseError && 'border-destructive',
        )}
        spellCheck={false}
        value={text}
        onChange={e => { setText(e.target.value); setDirty(true) }}
      />
      <p className="text-xs text-muted-foreground">
        Формат: <code>ksc-mgmt-policy/1</code>. Параметры адресуются путём «категория / подкатегория / группа / имя».
        «Применить» заменяет настройки, списки и матрицу устройств политики содержимым редактора целиком.
      </p>
    </div>
  )
}
