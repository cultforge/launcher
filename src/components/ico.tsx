// src/ico.tsx

import { cn } from "../lib/cn";

interface IconProps {
  icon: any;
  size?: number | string;
  className?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}

export const Icon = ({
  icon: IconComponent,
  size = 20,
  className,
  weight,
}: IconProps) => {
  if (typeof IconComponent === "string") {
    return (
      <img
        src={IconComponent}
        width={size}
        height={size}
        className={cn("block shrink-0", className)}
        alt=""
      />
    );
  }
  return (
    <IconComponent
      size={size}
      className={cn("block shrink-0", className)}
      style={{ display: "block" }}
      {...(weight && { weight })}
    />
  );
};
