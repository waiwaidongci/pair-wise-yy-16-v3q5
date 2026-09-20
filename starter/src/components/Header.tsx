import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useUser, USERS } from '../context/UserContext'

const NAV = [
  { to: '/', label: '首页', end: true },
  { to: '/work', label: '作品' },
  { to: '/collections', label: '合集' },
  { to: '/proofs', label: '校样' },
  { to: '/about', label: '关于' },
  { to: '/contact', label: '联系' },
]

export function Header() {
  const { userId, switchUser } = useUser()
  const [open, setOpen] = useState(false)

  return (
    <header className="site-header">
      <div className="bar">
        <NavLink to="/" className="brand">
          林澜<em>·</em>摄影
        </NavLink>
        <button
          className="menu-toggle"
          aria-label="菜单"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          ☰
        </button>
        <nav className={`site-nav${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end as boolean | undefined}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
          <span className="user-switch">
            <label htmlFor="user-select">当前身份</label>
            <select
              id="user-select"
              data-testid="user-select"
              value={userId}
              onChange={(e) => switchUser(e.target.value)}
            >
              {USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.role}
                </option>
              ))}
            </select>
          </span>
        </nav>
      </div>
    </header>
  )
}
