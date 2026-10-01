/*
 * The query string of the tasks screen the user last saw, so "Tasks" in the details breadcrumb
 * returns to the same view, filters and page.
 */
let lastSearch = '';

export function rememberTasksSearch(search: string) {
  lastSearch = search === '' || search.startsWith('?') ? search : `?${search}`;
}

export function tasksListHref(): string {
  return `/tasks${lastSearch}`;
}
