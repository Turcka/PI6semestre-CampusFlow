# components/

Componentes reutilizáveis sem regra de negócio, estilizados com Tailwind CSS.

- `ui/` - primitivos: `Button`, `Input`, `Select`, `Textarea`, `Badge`, `Card`, `Dialog`, `Drawer`, `Table`, `Tabs`, `Toast`, `Skeleton`, `EmptyState`.
- `layout/` - `Sidebar`, `BottomNav`, `Topbar`, `PageHeader`, `Container`.
- `forms/` - wrappers de React Hook Form + zod (`FormField`, `FormError`).
- `charts/` - wrappers de Recharts com tema padrão (`BarChartCard`, `LineChartCard`, `FunnelChart`).

Regras: acessibilidade básica (labels, foco, `aria-*`), mobile-first, variantes via props (sem CSS-in-JS).
