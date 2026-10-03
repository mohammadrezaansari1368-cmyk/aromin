/** Historical transactions remain available; only selectable experts are filtered. */
export const isActivePerson = (person: { inactive?: boolean } | null | undefined): boolean => !!person && !person.inactive
