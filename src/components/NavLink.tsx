import React from "react";
import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { cn } from "@/lib/utils";

interface CustomNavLinkProps extends NavLinkProps {
  activeClassName?: string;
}

export const NavLink = React.forwardRef<HTMLAnchorElement, CustomNavLinkProps>(
  ({ className, activeClassName, ...props }, ref) => {
    return (
      <RouterNavLink
        {...props}
        ref={ref}
        className={({ isActive }) =>
          cn(
            typeof className === "function" ? className({ isActive }) : className,
            isActive && activeClassName
          )
        }
      />
    );
  }
);

NavLink.displayName = "NavLink";
