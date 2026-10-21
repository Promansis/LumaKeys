/** Opens the web server's sign-in page. A module of its own so tests can replace it. */
export function navigateToLogin(): void {
  window.location.assign('/login');
}
