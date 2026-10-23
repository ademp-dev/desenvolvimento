/** Ícone Material Symbols, ex.: <Icon name="inbox" />. */
export function Icon({ name, fill = false, className = "", size }: { name: string; fill?: boolean; className?: string; size?: number }) {
  return (
    <span aria-hidden className={`msi ${fill ? "msi-fill" : ""} ${className}`} style={size ? { fontSize: size } : undefined}>
      {name}
    </span>
  );
}
