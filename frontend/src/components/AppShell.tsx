import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `app-header__navlink${isActive ? " is-active" : ""}`;
}

function initials(firstName: string, lastName: string, email: string): string {
  const first = firstName?.trim()?.[0];
  const last = lastName?.trim()?.[0];
  if (first || last) return `${first ?? ""}${last ?? ""}`.toUpperCase();
  return email?.[0]?.toUpperCase() ?? "?";
}

/**
 * Coquille commune à toutes les pages authentifiées : en-tête sur deux
 * rangées (B&F + profil en haut, liens de nav juste en dessous), puis le
 * contenu de la page dans un conteneur centré. La déconnexion vit dans le
 * menu profil, pas comme icône séparée toujours visible.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fullName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "";

  function handleLogout() {
    setMenuOpen(false);
    logout();
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header__top">
          <Link to="/documents" className="app-header__brand">
            B&amp;F
          </Link>
          {user && (
            <div className="profile-menu" ref={menuRef}>
              <button
                type="button"
                className="icon-btn icon-btn--avatar"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Profil"
                aria-expanded={menuOpen}
              >
                {initials(user.first_name, user.last_name, user.email)}
              </button>
              {menuOpen && (
                <div className="profile-dropdown">
                  {fullName && <div className="profile-dropdown__name">{fullName}</div>}
                  <div className="profile-dropdown__email">{user.email}</div>
                  <button type="button" className="profile-dropdown__logout" onClick={handleLogout}>
                    <LogOut size={14} /> Déconnexion
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="app-header__links">
          <NavLink to="/documents" className={navLinkClass}>
            Mes documents
          </NavLink>
          <NavLink to="/companies" className={navLinkClass}>
            Mes entreprises
          </NavLink>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  );
}
