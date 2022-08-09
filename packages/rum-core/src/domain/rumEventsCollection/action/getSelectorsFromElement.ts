import { arrayFrom, cssEscape, elementMatches } from '@datadog/browser-core'

export function getSelectorsFromElement(element: Element) {
  return {
    selector: getSelectorFromElement(element),
  }
}

type GetSelector = (element: Element) => string | undefined

function getSelectorFromElement(
  targetElement: Element,
  globallyUniqueSelectorStrategies: GetSelector[],
  uniqueAmongChildrenSelectorStrategies: GetSelector[]
): string {
  const targetElementSelector: string[] = []
  let element: Element | null = targetElement

  while (element && element.nodeName !== 'HTML') {
    const uniqueSelector = findSelector(element, globallyUniqueSelectorStrategies, isSelectorUniqueGlobally)
    if (uniqueSelector) {
      targetElementSelector.unshift(uniqueSelector)
      break
    }

    targetElementSelector.unshift(
      findSelector(element, uniqueAmongChildrenSelectorStrategies, isSelectorUniqueAmongChildren) ||
        getPositionSelector(element)
    )

    element = element.parentElement
  }

  return targetElementSelector.join('>')
}

function getIDSelector(element: Element): string | undefined {
  if (element.id) {
    return `#${cssEscape(element.id)}`
  }
}

function getClassSelector(element: Element): string | undefined {
  if (element.classList.length > 0) {
    const orderedClassList = arrayFrom(element.classList).sort()
    return `${element.tagName}${orderedClassList.map((className) => `.${cssEscape(className)}`).join('')}`
  }
}

function getPositionSelector(element: Element): string {
  const parent = element.parentElement!
  let sibling = parent.firstElementChild
  let currentIndex = 0
  let elementIndex: number | undefined

  while (sibling) {
    if (sibling.tagName === element.tagName) {
      currentIndex += 1
      if (sibling === element) {
        elementIndex = currentIndex
      }

      if (elementIndex !== undefined && currentIndex > 1) {
        // Performance improvement: avoid iterating over all children, stop as soon as we are sure
        // the element is not alone
        break
      }
    }
    sibling = sibling.nextElementSibling
  }

  return currentIndex === 1 ? element.tagName : `${element.tagName}:nth-of-type(${elementIndex!})`
}

function findSelector(
  element: Element,
  selectorGetters: GetSelector[],
  predicate: (element: Element, selector: string) => boolean
) {
  for (const selectorGetter of selectorGetters) {
    const selector = selectorGetter(element)
    if (selector && predicate(element, selector)) {
      return selector
    }
  }
}

function isSelectorUniqueGlobally(element: Element, selector: string): boolean {
  return element.ownerDocument.body.querySelectorAll(selector).length === 1
}

function isSelectorUniqueAmongChildren(element: Element, selector: string): boolean {
  for (let i = 0; i < element.parentElement!.children.length; i++) {
    const sibling = element.parentElement!.children[i]
    if (sibling !== element && elementMatches(sibling, selector)) {
      return false
    }
  }
  return true
}
