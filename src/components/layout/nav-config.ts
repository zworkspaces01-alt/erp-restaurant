import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { UserRole } from "@/types/restaurant";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to view this item. If omitted, all authenticated roles can view. */
  allowedRoles?: UserRole[];
  /** Sub-links rendered under the item (and used for active matching). */
  children?: {
    title: string;
    href: string;
    allowedRoles?: UserRole[];
  }[];
}

export interface NavGroup {
  title: string;
  allowedRoles?: UserRole[];
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Tổng quan",
    items: [{ title: "Bảng điều khiển", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Vận hành",
    items: [
      {
        title: "Kho nguyên liệu",
        href: "/inventory",
        icon: Package,
        allowedRoles: ["owner", "manager"],
        children: [
          { title: "Nguyên liệu", href: "/inventory" },
          { title: "Danh mục nguyên liệu", href: "/inventory/categories" },
          { title: "Sổ kho", href: "/inventory/transactions" },
          { title: "Kiểm kê & hao hụt", href: "/inventory/adjustments" },
        ],
      },
      {
        title: "Thực đơn & định lượng",
        href: "/menu",
        icon: UtensilsCrossed,
        children: [
          { title: "Món ăn", href: "/menu" },
          { title: "Danh mục món", href: "/menu/categories", allowedRoles: ["owner", "manager"] },
          { title: "Menu Engineering", href: "/menu/engineering", allowedRoles: ["owner", "manager"] },
        ],
      },
      { title: "Bán hàng", href: "/orders", icon: Receipt },
    ],
  },
  {
    title: "Mua hàng & công nợ",
    allowedRoles: ["owner", "manager"],
    items: [
      { title: "Nhà cung cấp", href: "/suppliers", icon: Truck },
      { title: "Phiếu nhập kho", href: "/purchases", icon: ShoppingCart },
      { title: "Thanh toán NCC", href: "/payments", icon: Wallet },
    ],
  },
  {
    title: "Nhân sự",
    items: [
      { title: "Nhân viên", href: "/employees", icon: Users, allowedRoles: ["owner", "manager"] },
      { title: "Chấm công", href: "/timekeeping", icon: ClipboardList },
      { title: "Bảng lương", href: "/payroll", icon: Wallet, allowedRoles: ["owner", "manager"] },
    ],
  },
  {
    title: "Tài chính",
    allowedRoles: ["owner", "manager"],
    items: [
      {
        title: "Chi phí vận hành",
        href: "/expenses",
        icon: CreditCard,
        children: [
          { title: "Hóa đơn chi phí", href: "/expenses" },
          { title: "Danh mục chi phí", href: "/expenses/categories" },
        ],
      },
      {
        title: "Báo cáo tài chính",
        href: "/reports/daily",
        icon: BarChart3,
        children: [
          { title: "Tiêu hao & Lỗ lãi ngày", href: "/reports/daily" },
          { title: "Báo cáo P&L (Tháng/Quý)", href: "/reports/pnl", allowedRoles: ["owner"] },
        ],
      },
    ],
  },
  {
    title: "Hệ thống",
    allowedRoles: ["owner"],
    items: [
      {
        title: "Tài khoản & Phân quyền",
        href: "/settings/users",
        icon: UserCheck,
        allowedRoles: ["owner"],
      },
    ],
  },
];

/** True when `pathname` is `href` or a sub-route of it. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Lọc menu navigation theo role của người dùng hiện tại */
export function filterNavGroupsByRole(groups: NavGroup[], role: UserRole | null): NavGroup[] {
  if (!role) return [];

  return groups
    .filter((group) => !group.allowedRoles || group.allowedRoles.includes(role))
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.allowedRoles || item.allowedRoles.includes(role))
        .map((item) => ({
          ...item,
          children: item.children?.filter(
            (child) => !child.allowedRoles || child.allowedRoles.includes(role)
          ),
        })),
    }))
    .filter((group) => group.items.length > 0);
}
