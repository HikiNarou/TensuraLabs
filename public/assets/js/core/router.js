/**
 * History API router with async page loading and pluggable view transitions.
 * A page module exports `createPage(ctx)` returning
 *   { el, ready?: Promise, enter?(info), leave?(), destroy(), title?: string }.
 * When a navigation does not name a transition, `resolveTransition(fromRoute, toRoute)`
 * picks one (e.g. a liquid direction between sections), falling back to a fade.
 */
const READY_TIMEOUT_MS = 10000;

export function createRouter({ outlet, routes, transitions, context, onChange, notFound, resolveTransition }) {
  let current = null; // { route, params, path, page, el }
  let busy = false;
  let pending = null;

  function match(pathname) {
    for (const route of routes) {
      const result = route.pattern.exec(pathname);
      if (result) {
        const params = {};
        (route.params ?? []).forEach((name, index) => { params[name] = decodeURIComponent(result[index + 1]); });
        return { route, params };
      }
    }
    return { route: notFound, params: {} };
  }

  async function navigate(path, options = {}) {
    const url = new URL(path, location.origin);
    if (busy) { pending = [url.pathname + url.search, options]; return; }
    const samePath = current && url.pathname === current.path && !options.force;
    if (samePath) return;
    busy = true;
    document.documentElement.classList.add('is-transitioning');

    try {
      const { route, params } = match(url.pathname);
      const module = await route.load();
      const page = module.createPage({ ...context, params, query: url.searchParams, navigate });
      page.el.classList.add('view');
      page.el.dataset.route = route.name;
      page.el.setAttribute('aria-hidden', 'true');
      // Keep the incoming view invisible while it loads so it never covers the current one.
      page.el.style.visibility = 'hidden';
      outlet.append(page.el);

      await Promise.race([page.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, READY_TIMEOUT_MS))]).catch(() => {});

      if (!options.fromPop) {
        const target = url.pathname + url.search + url.hash;
        if (options.replace || !current) history.replaceState({ path: target }, '', target);
        else history.pushState({ path: target }, '', target);
      }

      const previous = current;
      current = { route, params, path: url.pathname, page, el: page.el };
      document.title = page.title ?? context.defaultTitle();
      onChange?.(current, previous);

      const kind = previous
        ? (options.transition || resolveTransition?.(previous.route.name, route.name) || 'fade')
        : 'initial';
      const run = transitions[kind] ?? transitions.fade;
      page.el.removeAttribute('aria-hidden');
      // Transitions set their own initial state synchronously, before the next paint.
      page.el.style.visibility = '';
      await run({ from: previous, to: current, outlet });
      if (previous) {
        previous.page.destroy?.();
        previous.el.remove();
      }
      page.el.focus?.({ preventScroll: true });
    } catch (error) {
      console.error('[router] navigation failed', error);
    } finally {
      busy = false;
      document.documentElement.classList.remove('is-transitioning');
      if (pending) {
        const [nextPath, nextOptions] = pending;
        pending = null;
        navigate(nextPath, nextOptions);
      }
    }
  }

  function handleClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.dataset.external !== undefined) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/admin') || url.pathname.startsWith('/api')) return;
    event.preventDefault();
    navigate(url.pathname + url.search, { transition: anchor.dataset.transition });
  }

  return {
    start() {
      document.addEventListener('click', handleClick);
      window.addEventListener('popstate', () => navigate(location.pathname + location.search, { fromPop: true }));
      return navigate(location.pathname + location.search, { replace: true });
    },
    navigate,
    refresh: (transition = 'fade') => current && navigate(current.path + location.search, { force: true, replace: true, transition }),
    get current() { return current; },
    get busy() { return busy; },
  };
}
