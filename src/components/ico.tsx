// src/ico.tsx

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
      <img src={IconComponent} width={size} className={className} alt="Icon" />
    );
  }
  return (
    <IconComponent
      size={size}
      className={className}
      {...(weight && { weight })}
    />
  );
};
