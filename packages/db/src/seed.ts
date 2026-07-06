import { PrismaClient } from '@prisma/client'
import { readFileSync, readdirSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const prisma = new PrismaClient()

const CATALOGS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../catalogs')

interface ParameterEntry {
  application_name: string
  application_version: string
  category: string
  subcategory?: string
  group?: string
  name: string
  value_type: 'bool' | 'enum' | 'number' | 'string' | 'list'
  enum_options?: string[]
  unit?: string
  default_value?: unknown
  list_schema?: unknown
  description?: string
  purpose?: string
  doc_url?: string
  added_in_version?: string
  deprecated_in_version?: string
  removed_in_version?: string
  tradeoffs_pros?: string[]
  tradeoffs_cons?: string[]
}

interface EventEntry {
  application_name: string
  application_version: string
  component: string
  name: string
  severity: 'critical' | 'functional_failure' | 'warning' | 'informational'
  available_channels: string[]
  default_storage_days?: number
  description?: string
}

interface ApplicationEntry {
  name: string
  version: string
}

interface CriteriaEntry {
  criteria_key: string
  group: 'network' | 'ad' | 'application' | 'protection' | 'virtualisation'
  value_type: 'bool' | 'enum' | 'number' | 'string' | 'list'
  operator_options: string[]
  description?: string
}

function loadYamlFile<T>(filePath: string): T[] {
  const content = readFileSync(filePath, 'utf-8')
  const data = yaml.load(content)
  return Array.isArray(data) ? (data as T[]) : [data as T]
}

function loadDir<T>(dir: string): T[] {
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    return files.flatMap(f => loadYamlFile<T>(join(dir, f)))
  } catch {
    return []
  }
}

async function getOrCreateApplication(name: string, version: string) {
  return prisma.application.upsert({
    where: { name_version: { name, version } },
    create: { name, version },
    update: {},
  })
}

async function seedApplications() {
  const entries = loadDir<ApplicationEntry>(join(CATALOGS_DIR, 'applications'))
  for (const e of entries) {
    await getOrCreateApplication(e.name, e.version)
  }
  console.log(`  applications: ${entries.length}`)
}

async function seedParameters() {
  const entries = loadDir<ParameterEntry>(join(CATALOGS_DIR, 'parameters'))
  let created = 0
  let updated = 0
  for (const e of entries) {
    const app = await getOrCreateApplication(e.application_name, e.application_version)
    const existing = await prisma.parameterCatalog.findFirst({
      where: { applicationId: app.id, category: e.category, name: e.name },
    })
    const data = {
      subcategory: e.subcategory ?? null,
      group: e.group ?? null,
      valueType: e.value_type,
      enumOptions: (e.enum_options ?? null) as unknown as Parameters<typeof prisma.parameterCatalog.create>[0]['data']['enumOptions'],
      unit: e.unit ?? null,
      defaultValue: e.default_value !== undefined ? (e.default_value as Parameters<typeof prisma.parameterCatalog.create>[0]['data']['defaultValue']) : null,
      listSchema: (e.list_schema ?? null) as unknown as Parameters<typeof prisma.parameterCatalog.create>[0]['data']['listSchema'],
      description: e.description ?? null,
      purpose: e.purpose ?? null,
      docUrl: e.doc_url ?? null,
      addedInVersion: e.added_in_version ?? null,
      deprecatedInVersion: e.deprecated_in_version ?? null,
      removedInVersion: e.removed_in_version ?? null,
      tradeoffsPros: (e.tradeoffs_pros ?? null) as unknown as Parameters<typeof prisma.parameterCatalog.create>[0]['data']['tradeoffsPros'],
      tradeoffsCons: (e.tradeoffs_cons ?? null) as unknown as Parameters<typeof prisma.parameterCatalog.create>[0]['data']['tradeoffsCons'],
    }
    if (existing) {
      await prisma.parameterCatalog.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.parameterCatalog.create({
        data: { applicationId: app.id, category: e.category, name: e.name, ...data },
      })
      created++
    }
  }
  console.log(`  parameters: ${created} created, ${updated} updated`)
}

async function seedEvents() {
  const entries = loadDir<EventEntry>(join(CATALOGS_DIR, 'events'))
  let created = 0
  let updated = 0
  for (const e of entries) {
    const app = await getOrCreateApplication(e.application_name, e.application_version)
    const existing = await prisma.eventCatalog.findFirst({
      where: { applicationId: app.id, component: e.component, name: e.name },
    })
    const data = {
      severity: e.severity,
      availableChannels: e.available_channels as unknown as Parameters<typeof prisma.eventCatalog.create>[0]['data']['availableChannels'],
      defaultStorageDays: e.default_storage_days ?? 30,
      description: e.description ?? null,
    }
    if (existing) {
      await prisma.eventCatalog.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.eventCatalog.create({
        data: { applicationId: app.id, component: e.component, name: e.name, ...data },
      })
      created++
    }
  }
  console.log(`  events: ${created} created, ${updated} updated`)
}

async function seedCriteria() {
  const entries = loadDir<CriteriaEntry>(join(CATALOGS_DIR, 'criteria'))
  let created = 0
  let updated = 0
  for (const e of entries) {
    const existing = await prisma.criteriaCatalog.findFirst({
      where: { criteriaKey: e.criteria_key },
    })
    const data = {
      group: e.group,
      valueType: e.value_type,
      operatorOptions: e.operator_options as unknown as Parameters<typeof prisma.criteriaCatalog.create>[0]['data']['operatorOptions'],
      description: e.description ?? null,
    }
    if (existing) {
      await prisma.criteriaCatalog.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.criteriaCatalog.create({ data: { criteriaKey: e.criteria_key, ...data } })
      created++
    }
  }
  console.log(`  criteria: ${created} created, ${updated} updated`)
}

interface FunctionalAreaEntry {
  name: string
  group: string
  applicable_to_linux: boolean
  description?: string
}

async function seedFunctionalAreas() {
  const entries = loadDir<FunctionalAreaEntry>(join(CATALOGS_DIR, 'functional_areas'))
  let created = 0; let updated = 0
  for (const e of entries) {
    const data = { group: e.group, applicableToLinux: e.applicable_to_linux, description: e.description ?? null }
    const existing = await prisma.kscFunctionalAreaCatalog.findFirst({ where: { name: e.name } })
    if (existing) { await prisma.kscFunctionalAreaCatalog.update({ where: { id: existing.id }, data }); updated++ }
    else { await prisma.kscFunctionalAreaCatalog.create({ data: { name: e.name, ...data } }); created++ }
  }
  console.log(`  functional_areas: ${created} created, ${updated} updated`)
}

// Rights shorthand helpers
type R = { read: boolean; write: boolean; execute: boolean; performOnSelections: boolean }
const rw: R  = { read: true, write: true, execute: false, performOnSelections: false }
const rx: R  = { read: true, write: false, execute: true, performOnSelections: false }
const rwx: R = { read: true, write: true, execute: true, performOnSelections: true }
const ro: R  = { read: true, write: false, execute: false, performOnSelections: false }
const none: R = { read: false, write: false, execute: false, performOnSelections: false }

const PREDEFINED_ROLES: Array<{
  name: string; description: string
  grants: Record<string, R>
}> = [
  {
    name: 'Administration Server Administrator',
    description: 'Технический администратор инфраструктуры KSC (не антивирусных политик)',
    grants: {
      basic_functionality: rwx, event_processing: rwx, operations_on_administration_server: rwx,
      hierarchy_of_administration_servers: rwx, virtual_administration_servers: rwx,
      management_of_administration_groups: rw, connectivity: rwx,
      hardware_inventory: rwx, software_inventory: rwx, encryption_key_management: rw,
    },
  },
  {
    name: 'Kaspersky Endpoint Security Administrator',
    description: 'Администратор антивирусных политик KESL',
    grants: { basic_functionality: rwx, kesl_management: rwx, management_of_administration_groups: rwx },
  },
  {
    name: 'Kaspersky Endpoint Security Operator',
    description: 'Оператор: запуск задач и просмотр отчётов, без права менять политики',
    grants: { basic_functionality: rx, kesl_management: rx },
  },
  {
    name: 'Auditor',
    description: 'Аудитор: видит всё, включая объекты, закрытые ACL от других',
    grants: {
      basic_functionality: rwx, access_objects_regardless_of_acls: rwx,
      enforced_report_management: rwx, kesl_management: rwx,
      event_processing: rwx, hardware_inventory: ro, software_inventory: ro,
    },
  },
  {
    name: 'Supervisor',
    description: 'Руководитель ИБ: только просмотр, ничего не меняет и не запускает',
    grants: {
      basic_functionality: ro, kesl_management: ro, access_objects_regardless_of_acls: ro,
      event_processing: ro, hardware_inventory: ro, software_inventory: ro,
    },
  },
  {
    name: 'Security Officer',
    description: 'Офицер ИБ: просмотр, отчёты, connectivity для расследований инцидентов',
    grants: {
      basic_functionality: ro, kesl_management: ro, enforced_report_management: rwx,
      connectivity: rwx, event_processing: ro,
    },
  },
  {
    name: 'Main Administrator',
    description: 'Главный администратор: всё, кроме bypass-ACL и enforced-report',
    grants: {
      basic_functionality: rwx, kesl_management: rwx, management_of_administration_groups: rwx,
      deleted_objects: rwx, event_processing: rwx, operations_on_administration_server: rwx,
      kaspersky_software_deployment: rwx, license_key_management: rwx,
      hierarchy_of_administration_servers: rwx, user_permissions: rwx,
      virtual_administration_servers: rwx, connectivity: rwx,
      hardware_inventory: rwx, software_inventory: rwx,
    },
  },
  {
    name: 'Main Operator',
    description: 'Дежурный на всём стеке: Read+Execute везде, без права создавать/менять',
    grants: {
      basic_functionality: rx, kesl_management: rx, management_of_administration_groups: ro,
      event_processing: ro, hardware_inventory: ro, software_inventory: ro,
    },
  },
  {
    name: 'Installation Administrator',
    description: 'Развёртывание агентов и патчей с полным правом',
    grants: { kaspersky_software_deployment: rwx, remote_installation: rwx, basic_functionality: rwx },
  },
  {
    name: 'Installation Operator',
    description: 'Развёртывание агентов — без права утверждать патчи',
    grants: { kaspersky_software_deployment: rx, remote_installation: rx, basic_functionality: rx },
  },
]

async function seedRbac() {
  // Seed predefined roles + grants
  const areaMap = new Map<string, string>()
  const areas = await prisma.kscFunctionalAreaCatalog.findMany()
  for (const a of areas) areaMap.set(a.name, a.id)

  let roles = 0; let grants = 0
  for (const roleDef of PREDEFINED_ROLES) {
    let role = await prisma.kscRoleDefinition.findFirst({ where: { name: roleDef.name } })
    if (!role) {
      role = await prisma.kscRoleDefinition.create({
        data: { name: roleDef.name, isPredefined: true, description: roleDef.description },
      })
      roles++
    }
    for (const [areaName, rights] of Object.entries(roleDef.grants)) {
      const areaId = areaMap.get(areaName)
      if (!areaId) continue
      const existing = await prisma.kscRoleGrant.findFirst({ where: { roleId: role.id, functionalAreaId: areaId } })
      const rightsJson = rights as unknown as Parameters<typeof prisma.kscRoleGrant.create>[0]['data']['rights']
      if (existing) { await prisma.kscRoleGrant.update({ where: { id: existing.id }, data: { rights: rightsJson } }) }
      else { await prisma.kscRoleGrant.create({ data: { roleId: role.id, functionalAreaId: areaId, rights: rightsJson } }); grants++ }
    }
  }
  console.log(`  rbac roles: ${roles} created, ${grants} grants created`)
}

interface ThreatVectorEntry {
  name: string
  tactic: string
  description?: string
  mitre_technique_ref?: string
}

async function seedThreatVectors() {
  const entries = loadDir<ThreatVectorEntry>(join(CATALOGS_DIR, 'threat_vectors'))
  let created = 0; let updated = 0
  for (const e of entries) {
    const data = { tactic: e.tactic, description: e.description ?? null, mitreTechniqueRef: e.mitre_technique_ref ?? null }
    const existing = await prisma.threatVectorCatalog.findFirst({ where: { name: e.name } })
    if (existing) { await prisma.threatVectorCatalog.update({ where: { id: existing.id }, data }); updated++ }
    else { await prisma.threatVectorCatalog.create({ data: { name: e.name, ...data } }); created++ }
  }
  console.log(`  threat_vectors: ${created} created, ${updated} updated`)
}

interface ControlMappingEntry {
  application_name: string
  application_version: string
  category: string
  subcategory?: string // уточнение для каталогов, где имена параметров повторяются (12.4)
  group?: string
  parameter_name: string
  required_state: { value: unknown }
  coverage_strength: string
  threat_vector_names: string[]
  notes?: string
}

async function seedControlMappings() {
  const entries = loadDir<ControlMappingEntry>(join(CATALOGS_DIR, 'control_mappings'))
  const vectorMap = new Map<string, string>()
  const vectors = await prisma.threatVectorCatalog.findMany()
  for (const v of vectors) vectorMap.set(v.name, v.id)

  let created = 0
  for (const e of entries) {
    const app = await prisma.application.findFirst({
      where: { name: e.application_name, version: e.application_version },
    })
    if (!app) continue
    const param = await prisma.parameterCatalog.findFirst({
      where: {
        applicationId: app.id,
        category: e.category,
        name: e.parameter_name,
        ...(e.subcategory !== undefined ? { subcategory: e.subcategory } : {}),
        ...(e.group !== undefined ? { group: e.group } : {}),
      },
    })
    if (!param) {
      console.log(`    ! параметр не найден: ${e.category} / ${e.subcategory ?? '-'} / ${e.parameter_name}`)
      continue
    }

    const tvIds = e.threat_vector_names
      .map(n => vectorMap.get(n))
      .filter((id): id is string => !!id)

    // Check if mapping already exists (same param + required_state + strength)
    const requiredStateJson = e.required_state as Parameters<typeof prisma.controlMapping.create>[0]['data']['requiredState']
    const existing = await prisma.controlMapping.findFirst({
      where: {
        parameterId: param.id,
        coverageStrength: e.coverage_strength,
        notes: e.notes ?? null,
      },
    })
    if (!existing) {
      await prisma.controlMapping.create({
        data: {
          parameterId: param.id,
          requiredState: requiredStateJson,
          coverageStrength: e.coverage_strength,
          notes: e.notes ?? null,
          threatVectors: { connect: tvIds.map(id => ({ id })) },
        },
      })
      created++
    }
  }
  console.log(`  control_mappings: ${created} created`)
}

// ─── KESL 12.4 Excel-derived catalogs ────────────────────────────────────────
// Files generated by build_catalogs.py live directly in catalogs/.
// Missing files are skipped silently — drop them in and re-run the seed.

const KESL_124 = { name: 'KESL', version: '12.4' }
const AGENT_EXCEL = { name: 'Агент администрирования', version: '15.1' }

interface ExcelParamEntry {
  id: string
  application: string // kesl | network_agent
  category: string
  subcategory?: string | null
  group?: string | null
  name: string
  value_type: 'bool' | 'enum' | 'number' | 'string' | 'list'
  enum_options?: string[]
  added_in_version?: string
  tradeoffs_pros?: string[]
  tradeoffs_cons?: string[]
}

function fileExists(p: string): boolean {
  try { readFileSync(p); return true } catch { return false }
}

async function seedExcelParameters(fileName: string, appDef: { name: string; version: string }) {
  const path = join(CATALOGS_DIR, fileName)
  if (!fileExists(path)) { console.log(`  ${fileName}: отсутствует, пропущен`); return }
  const entries = loadYamlFile<ExcelParamEntry>(path)
  const app = await getOrCreateApplication(appDef.name, appDef.version)
  let created = 0; let updated = 0
  for (const e of entries) {
    const existing = await prisma.parameterCatalog.findFirst({
      where: { applicationId: app.id, category: e.category, subcategory: e.subcategory ?? null, group: e.group ?? null, name: e.name },
    })
    const data = {
      subcategory: e.subcategory ?? null,
      group: e.group ?? null,
      valueType: e.value_type,
      enumOptions: (e.enum_options ?? null) as unknown as Parameters<typeof prisma.parameterCatalog.create>[0]['data']['enumOptions'],
      addedInVersion: e.added_in_version ?? appDef.version,
      tradeoffsPros: (e.tradeoffs_pros?.length ? e.tradeoffs_pros : null) as unknown as Parameters<typeof prisma.parameterCatalog.create>[0]['data']['tradeoffsPros'],
      tradeoffsCons: (e.tradeoffs_cons?.length ? e.tradeoffs_cons : null) as unknown as Parameters<typeof prisma.parameterCatalog.create>[0]['data']['tradeoffsCons'],
    }
    if (existing) { await prisma.parameterCatalog.update({ where: { id: existing.id }, data }); updated++ }
    else {
      await prisma.parameterCatalog.create({
        data: { applicationId: app.id, category: e.category, name: e.name, ...data },
      })
      created++
    }
  }
  console.log(`  ${fileName}: ${created} created, ${updated} updated`)
}

interface SectionMapFile {
  sections: Array<{ id: string; name: string; components: Array<{ id: string; name: string }> }>
  mapping: Array<{
    excel_subcategory: string
    section: string
    component: string
    verified: boolean
    doc_url?: string
    note?: string
  }>
}

async function seedSectionMap() {
  const path = join(CATALOGS_DIR, 'section_map.yaml')
  if (!fileExists(path)) { console.log('  section_map.yaml: отсутствует, пропущен'); return }
  const data = yaml.load(readFileSync(path, 'utf-8')) as SectionMapFile

  let sOrder = 0
  for (const s of data.sections) {
    await prisma.kscSection.upsert({
      where: { id: s.id },
      create: { id: s.id, name: s.name, sortOrder: sOrder },
      update: { name: s.name, sortOrder: sOrder },
    })
    sOrder++
    let cOrder = 0
    for (const c of s.components) {
      await prisma.kscComponent.upsert({
        where: { id: c.id },
        create: { id: c.id, name: c.name, sortOrder: cOrder, sectionId: s.id },
        update: { name: c.name, sortOrder: cOrder, sectionId: s.id },
      })
      cOrder++
    }
  }

  let mCreated = 0; let mSkipped = 0
  for (const m of data.mapping) {
    const existing = await prisma.kscSubcategoryMapping.findUnique({
      where: { excelSubcategory: m.excel_subcategory },
    })
    if (existing?.overridden) { mSkipped++; continue } // ручная правка админа важнее каталога
    await prisma.kscSubcategoryMapping.upsert({
      where: { excelSubcategory: m.excel_subcategory },
      create: {
        excelSubcategory: m.excel_subcategory,
        sectionId: m.section,
        componentId: m.component,
        verified: m.verified,
        docUrl: m.doc_url ?? null,
        note: m.note ?? null,
      },
      update: {
        sectionId: m.section,
        componentId: m.component,
        verified: m.verified,
        docUrl: m.doc_url ?? null,
        note: m.note ?? null,
      },
    })
    mCreated++
  }
  console.log(`  section_map: ${data.sections.length} sections, ${mCreated} mappings (${mSkipped} overridden, не тронуты)`)
}

interface ListSchemasFile {
  list_types: Array<{ id: string; name: string; component?: string; columns: unknown }>
}

async function seedListTypes() {
  const path = join(CATALOGS_DIR, 'kesl_list_schemas.yaml')
  if (!fileExists(path)) { console.log('  kesl_list_schemas.yaml: отсутствует, пропущен'); return }
  const data = yaml.load(readFileSync(path, 'utf-8')) as ListSchemasFile
  for (const lt of data.list_types) {
    const columns = lt.columns as Parameters<typeof prisma.listTypeCatalog.create>[0]['data']['columns']
    await prisma.listTypeCatalog.upsert({
      where: { id: lt.id },
      create: { id: lt.id, name: lt.name, component: lt.component ?? null, columns },
      update: { name: lt.name, component: lt.component ?? null, columns },
    })
  }
  console.log(`  list_types: ${data.list_types.length}`)
}

interface DeviceControlFile {
  device_types: Array<{ id: string; name: string; section?: string; access_options: string[] }>
  all_access_options: string[]
  custom_rules_schema: unknown
  bus_types: string[]
  bus_access_options: string[]
}

async function seedDeviceControl() {
  const path = join(CATALOGS_DIR, 'device_control.yaml')
  if (!fileExists(path)) { console.log('  device_control.yaml: отсутствует, пропущен'); return }
  const data = yaml.load(readFileSync(path, 'utf-8')) as DeviceControlFile
  for (const dt of data.device_types) {
    const accessOptions = dt.access_options as unknown as Parameters<typeof prisma.deviceTypeCatalog.create>[0]['data']['accessOptions']
    await prisma.deviceTypeCatalog.upsert({
      where: { catalogKey: dt.id },
      create: { catalogKey: dt.id, name: dt.name, section: dt.section ?? null, accessOptions },
      update: { name: dt.name, section: dt.section ?? null, accessOptions },
    })
  }
  // Шины подключения (USB, FireWire) — как отдельные строки матрицы со своим набором режимов
  for (const bus of data.bus_types) {
    const accessOptions = data.bus_access_options as unknown as Parameters<typeof prisma.deviceTypeCatalog.create>[0]['data']['accessOptions']
    await prisma.deviceTypeCatalog.upsert({
      where: { catalogKey: `bus_${bus.toLowerCase()}` },
      create: { catalogKey: `bus_${bus.toLowerCase()}`, name: bus, section: 'Шины подключения', accessOptions },
      update: { name: bus, section: 'Шины подключения', accessOptions },
    })
  }
  // Пользовательские правила доступа — как тип списка, чтобы работал общий CRUD строк
  const customRulesColumns = data.custom_rules_schema as Parameters<typeof prisma.listTypeCatalog.create>[0]['data']['columns']
  await prisma.listTypeCatalog.upsert({
    where: { id: 'device_control_custom_rules' },
    create: { id: 'device_control_custom_rules', name: 'Пользовательские правила', component: 'Контроль устройств', columns: customRulesColumns },
    update: { name: 'Пользовательские правила', component: 'Контроль устройств', columns: customRulesColumns },
  })
  // Временный доступ к устройству (KSC Web Console → предоставление доступа по запросу)
  const tempAccessColumns = [
    { key: 'device_id', label: 'Идентификатор устройства', type: 'string' },
    { key: 'device_type', label: 'Тип устройства', type: 'string' },
    { key: 'user_or_group', label: 'Пользователь', type: 'string' },
    { key: 'access_until', label: 'Доступ до (дата/время)', type: 'string' },
    { key: 'comment', label: 'Основание / комментарий', type: 'string' },
  ] as Parameters<typeof prisma.listTypeCatalog.create>[0]['data']['columns']
  await prisma.listTypeCatalog.upsert({
    where: { id: 'device_temporary_access' },
    create: { id: 'device_temporary_access', name: 'Временный доступ', component: 'Контроль устройств', columns: tempAccessColumns },
    update: { name: 'Временный доступ', component: 'Контроль устройств', columns: tempAccessColumns },
  })
  await prisma.deviceControlMeta.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      busTypes: data.bus_types,
      busAccessOptions: data.bus_access_options,
      allAccessOptions: data.all_access_options,
      customRulesSchema: data.custom_rules_schema as Parameters<typeof prisma.deviceControlMeta.create>[0]['data']['customRulesSchema'],
    },
    update: {
      busTypes: data.bus_types,
      busAccessOptions: data.bus_access_options,
      allAccessOptions: data.all_access_options,
      customRulesSchema: data.custom_rules_schema as Parameters<typeof prisma.deviceControlMeta.create>[0]['data']['customRulesSchema'],
    },
  })
  console.log(`  device_control: ${data.device_types.length} типов устройств + meta`)
}

// kesl_policy_values.yaml → 11 политик со значениями и флагом «Принудительно».
// Требует environment + administration group; создаёт demo-окружение при отсутствии.
interface PolicyValuesFile {
  policies: Record<string, Array<{ parameter_id: string; value: string; forced: boolean | null }>>
}

function parseExcelValue(raw: string, valueType: string): unknown {
  const low = raw.trim().toLowerCase()
  if (['не применимо', 'не доступно', 'недоступно', ''].includes(low)) return null
  if (valueType === 'bool') {
    if (['да', 'включено', 'включен', 'вкл'].includes(low)) return true
    if (['нет', 'выключено', 'выключен', 'выкл', 'отключено'].includes(low)) return false
    return null
  }
  if (valueType === 'number') {
    const n = Number(raw.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return raw.trim()
}

async function seedPolicyValues() {
  const path = join(CATALOGS_DIR, 'kesl_policy_values.yaml')
  if (!fileExists(path)) { console.log('  kesl_policy_values.yaml: отсутствует, пропущен'); return }
  const data = yaml.load(readFileSync(path, 'utf-8')) as PolicyValuesFile

  const app = await getOrCreateApplication(KESL_124.name, KESL_124.version)

  // Index of 12.4 parameters by their Excel catalog id.
  // Excel id encodes category.subcategory.group.name — rebuild the lookup by matching all four.
  const params = await prisma.parameterCatalog.findMany({ where: { applicationId: app.id } })
  const slug = (s: string | null | undefined) =>
    (s ?? '').trim().toLowerCase().replace(/[^\wа-яё\s-]/gu, '').replace(/[\s-]+/gu, '_').replace(/^_+|_+$/g, '') || 'x'
  const byExcelId = new Map<string, typeof params[number]>()
  const counters = new Map<string, number>()
  for (const p of params) {
    let pid = `kesl.${slug(p.category)}.${slug(p.subcategory)}.${slug(p.group)}.${slug(p.name)}`
    const n = counters.get(pid) ?? 0
    counters.set(pid, n + 1)
    if (n > 0) pid = `${pid}_${n + 1}`
    byExcelId.set(pid, p)
  }

  const env = await prisma.environment.upsert({
    where: { name: 'Импорт из Excel' },
    create: { name: 'Импорт из Excel', description: 'Политики, импортированные из исходной таблицы KSC' },
    update: {},
  })
  const group = (await prisma.administrationGroup.findFirst({ where: { environmentId: env.id, name: 'Импортированные политики' } }))
    ?? (await prisma.administrationGroup.create({ data: { environmentId: env.id, name: 'Импортированные политики' } }))

  let policiesCreated = 0; let settingsWritten = 0; let unresolved = 0
  for (const [code, rows] of Object.entries(data.policies)) {
    let policy = await prisma.policy.findFirst({ where: { name: code, applicationId: app.id } })
    if (!policy) {
      policy = await prisma.policy.create({
        data: { name: code, applicationId: app.id, targetGroupId: group.id },
      })
      policiesCreated++
    }
    for (const row of rows) {
      const param = byExcelId.get(row.parameter_id)
      if (!param) { unresolved++; continue }
      const value = parseExcelValue(row.value, param.valueType)
      if (value === null) continue
      await prisma.policySetting.upsert({
        where: { policyId_parameterId: { policyId: policy.id, parameterId: param.id } },
        create: { policyId: policy.id, parameterId: param.id, value: value as Parameters<typeof prisma.policySetting.create>[0]['data']['value'], forced: row.forced ?? false },
        update: { value: value as Parameters<typeof prisma.policySetting.create>[0]['data']['value'], forced: row.forced ?? false },
      })
      settingsWritten++
    }
  }
  console.log(`  policy_values: ${policiesCreated} политик создано, ${settingsWritten} значений, ${unresolved} не сопоставлено`)
}

// kesl_list_seed_main.yaml → строки списков-таблиц для политики MAIN
interface ListSeedFile {
  policy: string
  seed_rows: Record<string, Array<Record<string, unknown>>>
}

async function seedListRows() {
  const path = join(CATALOGS_DIR, 'kesl_list_seed_main.yaml')
  if (!fileExists(path)) { console.log('  kesl_list_seed_main.yaml: отсутствует, пропущен'); return }
  const data = yaml.load(readFileSync(path, 'utf-8')) as ListSeedFile

  const app = await prisma.application.findFirst({ where: { name: KESL_124.name, version: KESL_124.version } })
  if (!app) { console.log('  list_seed: приложение KESL 12.4 не найдено, пропущен'); return }
  const policy = await prisma.policy.findFirst({ where: { name: data.policy, applicationId: app.id } })
  if (!policy) { console.log(`  list_seed: политика ${data.policy} не найдена, пропущен`); return }

  let written = 0
  for (const [listTypeId, rows] of Object.entries(data.seed_rows)) {
    const listType = await prisma.listTypeCatalog.findUnique({ where: { id: listTypeId } })
    if (!listType) continue
    // idempotent: полная замена строк списка при повторном сиде
    await prisma.policyListSetting.deleteMany({ where: { policyId: policy.id, listTypeId } })
    let order = 0
    for (const row of rows) {
      await prisma.policyListSetting.create({
        data: {
          policyId: policy.id,
          listTypeId,
          rowData: row as Parameters<typeof prisma.policyListSetting.create>[0]['data']['rowData'],
          sortOrder: order++,
        },
      })
      written++
    }
  }
  console.log(`  list_seed (${data.policy}): ${written} строк`)
}

// network_agent_events.yaml → события Агента (формат отличается от events/*.yaml)
interface AgentEventEntry {
  id: string
  application: string
  name: string
  severity: string
  default_storage_days?: number | null
  channels: Record<string, boolean>
}

const AGENT_SEVERITY_MAP: Record<string, 'critical' | 'functional_failure' | 'warning' | 'informational'> = {
  'критическое': 'critical',
  'отказ функционирования': 'functional_failure',
  'предупреждение': 'warning',
  'информационное': 'informational',
}

async function seedAgentExcelEvents() {
  const path = join(CATALOGS_DIR, 'network_agent_events.yaml')
  if (!fileExists(path)) { console.log('  network_agent_events.yaml: отсутствует, пропущен'); return }
  const entries = loadYamlFile<AgentEventEntry>(path)
  const app = await getOrCreateApplication(AGENT_EXCEL.name, AGENT_EXCEL.version)
  let created = 0; let updated = 0
  for (const e of entries) {
    const severity = AGENT_SEVERITY_MAP[e.severity.trim().toLowerCase()] ?? 'informational'
    const channels = Object.entries(e.channels).filter(([, on]) => on).map(([k]) => k)
    const existing = await prisma.eventCatalog.findFirst({
      where: { applicationId: app.id, component: 'Агент', name: e.name },
    })
    const data = {
      severity,
      availableChannels: channels as unknown as Parameters<typeof prisma.eventCatalog.create>[0]['data']['availableChannels'],
      defaultStorageDays: e.default_storage_days ?? 30,
    }
    if (existing) { await prisma.eventCatalog.update({ where: { id: existing.id }, data }); updated++ }
    else {
      await prisma.eventCatalog.create({ data: { applicationId: app.id, component: 'Агент', name: e.name, ...data } })
      created++
    }
  }
  console.log(`  network_agent_events: ${created} created, ${updated} updated`)
}

// group_tree.yaml → дерево групп администрирования в окружении «Импорт из Excel»
interface GroupTreeFile {
  groups: Array<{
    id: string
    name: string
    parent_id: string | null
    depth: number
    description?: string | null
    add_criterion?: string | null
    agent_policy?: string | null
    kesl_policy?: string | null
  }>
}

async function seedGroupTree() {
  const path = join(CATALOGS_DIR, 'group_tree.yaml')
  if (!fileExists(path)) { console.log('  group_tree.yaml: отсутствует, пропущен'); return }
  const data = yaml.load(readFileSync(path, 'utf-8')) as GroupTreeFile

  const env = await prisma.environment.upsert({
    where: { name: 'Импорт из Excel' },
    create: { name: 'Импорт из Excel', description: 'Политики, импортированные из исходной таблицы KSC' },
    update: {},
  })

  const idMap = new Map<string, string>() // catalog id → db id
  let created = 0
  for (const g of data.groups) { // file order is top-down, parents come first
    const parentDbId = g.parent_id ? idMap.get(g.parent_id) ?? null : null
    // Критерий добавления и назначенные политики — человекочитаемый текст из таблицы,
    // хранится в addCriteria до сопоставления с реальными правилами/политиками
    const meta = {
      description: g.description ?? null,
      addCriteria: (g.add_criterion || g.agent_policy || g.kesl_policy)
        ? ({
            text: g.add_criterion ?? null,
            agent_policy: g.agent_policy ?? null,
            kesl_policy: g.kesl_policy ?? null,
          } as Parameters<typeof prisma.administrationGroup.create>[0]['data']['addCriteria'])
        : undefined,
    }
    let node = await prisma.administrationGroup.findFirst({
      where: { environmentId: env.id, name: g.name, parentId: parentDbId },
    })
    if (!node) {
      node = await prisma.administrationGroup.create({
        data: { environmentId: env.id, name: g.name, parentId: parentDbId, ...meta },
      })
      created++
    } else {
      await prisma.administrationGroup.update({ where: { id: node.id }, data: meta })
    }
    idMap.set(g.id, node.id)
  }
  console.log(`  group_tree: ${created} групп создано (всего в файле ${data.groups.length})`)
}

// Обогащение параметров (описания, влияние на защиту/производительность) —
// отдельный каталог, чтобы регенерация kesl_parameters.yaml из Excel
// не затирала рукописный контент. Ключ: приложение + подкатегория + группа + имя.
interface EnrichmentEntry {
  application_name: string
  application_version: string
  subcategory?: string | null
  group?: string | null
  name: string
  description?: string
  purpose?: string
  tradeoffs_pros?: string[]
  tradeoffs_cons?: string[]
}

async function seedParameterEnrichment() {
  const entries = loadDir<EnrichmentEntry>(join(CATALOGS_DIR, 'parameter_enrichment'))
  if (entries.length === 0) { console.log('  parameter_enrichment: файлов нет, пропущен'); return }
  let applied = 0; let missing = 0
  for (const e of entries) {
    const app = await prisma.application.findFirst({
      where: { name: e.application_name, version: e.application_version },
    })
    if (!app) { missing++; continue }
    const param = await prisma.parameterCatalog.findFirst({
      where: {
        applicationId: app.id,
        name: e.name,
        ...(e.subcategory !== undefined ? { subcategory: e.subcategory } : {}),
        ...(e.group !== undefined ? { group: e.group } : {}),
      },
    })
    if (!param) {
      console.log(`    ! не найден: ${e.subcategory ?? '-'} / ${e.group ?? '-'} / ${e.name}`)
      missing++
      continue
    }
    await prisma.parameterCatalog.update({
      where: { id: param.id },
      data: {
        ...(e.description ? { description: e.description } : {}),
        ...(e.purpose ? { purpose: e.purpose } : {}),
        ...(e.tradeoffs_pros?.length
          ? { tradeoffsPros: e.tradeoffs_pros as unknown as Parameters<typeof prisma.parameterCatalog.update>[0]['data']['tradeoffsPros'] }
          : {}),
        ...(e.tradeoffs_cons?.length
          ? { tradeoffsCons: e.tradeoffs_cons as unknown as Parameters<typeof prisma.parameterCatalog.update>[0]['data']['tradeoffsCons'] }
          : {}),
      },
    })
    applied++
  }
  console.log(`  parameter_enrichment: ${applied} обогащено, ${missing} не найдено`)
}

interface TaskTemplateEntry {
  application_name: string
  application_version: string
  name: string
  description?: string
  default_trigger_type?: string
  params_schema: unknown
}

async function seedTaskTemplates() {
  const entries = loadDir<TaskTemplateEntry>(join(CATALOGS_DIR, 'task_templates'))
  let created = 0; let updated = 0
  for (const e of entries) {
    const app = await getOrCreateApplication(e.application_name, e.application_version)
    const data = {
      description: e.description ?? null,
      defaultTriggerType: e.default_trigger_type ?? null,
      paramsSchema: e.params_schema as Parameters<typeof prisma.taskTemplate.create>[0]['data']['paramsSchema'],
    }
    const existing = await prisma.taskTemplate.findFirst({ where: { applicationId: app.id, name: e.name } })
    if (existing) { await prisma.taskTemplate.update({ where: { id: existing.id }, data }); updated++ }
    else { await prisma.taskTemplate.create({ data: { applicationId: app.id, name: e.name, ...data } }); created++ }
  }
  console.log(`  task_templates: ${created} created, ${updated} updated`)
}

// KESL-события каталога описаны один раз (рукописный каталог 12.1);
// для 12.4 они переносятся копированием, чтобы вкладка «События» работала
// у политик обеих версий. Компонентный состав событий в 12.x стабилен.
async function seedKesl124Events() {
  const src = await prisma.application.findFirst({ where: { name: 'KESL', version: '12.1' } })
  const dst = await prisma.application.findFirst({ where: { name: 'KESL', version: '12.4' } })
  if (!src || !dst) return
  const events = await prisma.eventCatalog.findMany({ where: { applicationId: src.id } })
  let created = 0
  for (const e of events) {
    const existing = await prisma.eventCatalog.findFirst({
      where: { applicationId: dst.id, component: e.component, name: e.name },
    })
    const data = {
      severity: e.severity,
      availableChannels: e.availableChannels as Parameters<typeof prisma.eventCatalog.create>[0]['data']['availableChannels'],
      defaultStorageDays: e.defaultStorageDays,
      description: e.description,
    }
    if (existing) { await prisma.eventCatalog.update({ where: { id: existing.id }, data }) }
    else {
      await prisma.eventCatalog.create({ data: { applicationId: dst.id, component: e.component, name: e.name, ...data } })
      created++
    }
  }
  console.log(`  kesl_12.4_events: ${created} created (скопировано из 12.1)`)
}

async function main() {
  console.log('Seeding catalogs…')
  await seedApplications()
  await seedParameters()
  await seedEvents()
  await seedCriteria()
  await seedFunctionalAreas()
  await seedRbac()
  await seedThreatVectors()
  await seedControlMappings()

  console.log('Seeding KESL 12.4 (Excel)…')
  await seedExcelParameters('kesl_parameters.yaml', KESL_124)
  await seedExcelParameters('network_agent_parameters.yaml', AGENT_EXCEL)
  await seedSectionMap()
  await seedListTypes()
  await seedDeviceControl()
  await seedPolicyValues()
  await seedListRows()
  await seedAgentExcelEvents()
  await seedGroupTree()
  await seedTaskTemplates()
  await seedKesl124Events()
  await seedParameterEnrichment()
  // повторно — маппинги 12.4 требуют уже загруженных параметров 12.4
  await seedControlMappings()
  console.log('Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
