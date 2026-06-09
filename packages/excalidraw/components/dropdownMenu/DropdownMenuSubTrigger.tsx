import React from "react";

import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { chevronRight } from "../icons";

import {
  getDropdownMenuItemClassName,
  useHandleDropdownMenuItemSelect,
} from "./common";
import MenuItemContent from "./DropdownMenuItemContent";

import type { JSX } from "react";

const DropdownMenuSubTrigger = ({
  children,
  icon,
  shortcut,
  className,
  onSelect,
}: {
  children: React.ReactNode;
  icon?: JSX.Element;
  shortcut?: string;
  className?: string;
  onSelect?: (event: Event) => void;
}) => {
  const handleSelect = useHandleDropdownMenuItemSelect(onSelect);

  return (
    <DropdownMenuPrimitive.SubTrigger
      className={`${getDropdownMenuItemClassName(
        className,
      )} dropdown-menu__submenu-trigger`}
      onSelect={(event) => {
        handleSelect(event as unknown as Event);
        if (onSelect) {
          event.preventDefault();
        }
      }}
    >
      <MenuItemContent icon={icon} shortcut={shortcut}>
        {children}
      </MenuItemContent>
      <div className="dropdown-menu__submenu-trigger-icon">{chevronRight}</div>
    </DropdownMenuPrimitive.SubTrigger>
  );
};

export default DropdownMenuSubTrigger;
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";
