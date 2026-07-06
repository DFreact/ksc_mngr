// Русская локаль — единственная и дефолтная.
// Данные каталогов (названия параметров, разделов, списков) приходят из БД
// уже на русском и через словарь не проходят.

export const ru = {
  // Навигация
  'nav.groups': 'Группы и устройства',
  'nav.policies': 'Политики',
  'nav.comparison': 'Сравнение политик',
  'nav.automations': 'Автоматизации',
  'nav.discovery': 'Обнаружение устройств',
  'nav.tasks': 'Задачи',
  'nav.changeRequests': 'Управление изменениями',
  'nav.infrastructure': 'Инфраструктура',
  'nav.coverage': 'Покрытие угроз',
  'nav.docs': 'Документация',

  // Общие действия
  'common.save': 'Сохранить',
  'common.cancel': 'Отмена',
  'common.delete': 'Удалить',
  'common.edit': 'Изменить',
  'common.add': 'Добавить',
  'common.create': 'Создать',
  'common.close': 'Закрыть',
  'common.search': 'Поиск',
  'common.loading': 'Загрузка…',
  'common.empty': 'Список пуст',
  'common.notFound': 'Не найдено',
  'common.confirm': 'Подтвердить',
  'common.ok': 'ОК',

  // Редактор политики
  'policy.tabs.settings': 'Настройки',
  'policy.tabs.events': 'События',
  'policy.tabs.lists': 'Списки',
  'policy.tabs.devices': 'Устройства',
  'policy.status.active': 'Активна',
  'policy.status.inactive': 'Неактивна',
  'policy.status.outOfOffice': 'Не в офисе',
  'policy.inheritFromParent': 'Наследовать от родительской',
  'policy.forceInherit': 'Принудительная трансляция дочерним',
  'policy.findInKsc': 'Найти в KSC:',
  'policy.locationUnverified': 'расположение уточняется',
  'policy.locationOverridden': 'уточнено вручную',
  'policy.sectionUnmapped': 'Раздел не сопоставлен',
  'policy.fixMapping': 'Исправить привязку',

  // Таблицы-списки
  'table.addRow': 'Добавить строку',
  'table.emptyList': 'Список пуст — добавьте первую строку',
} as const

export type TranslationKey = keyof typeof ru
