/**
 * Spread onto a popout so it leaves the Tab order and the accessibility tree while closed.
 * React 18 does not type `inert` and drops a boolean `inert={true}`, so pass the empty string
 * attribute form instead and omit it entirely when the popout is open.
 */
export function inertWhenClosed(isOpen: boolean): Record<string, unknown> {
  return isOpen ? {} : { inert: '' };
}
