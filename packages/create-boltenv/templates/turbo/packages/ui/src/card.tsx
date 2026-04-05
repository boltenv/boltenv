interface CardProps {
  title: string;
  href: string;
  children: React.ReactNode;
}

export function Card({ title, href, children }: CardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        padding: "1.5rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        maxWidth: "300px",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        {title} &rarr;
      </h2>
      <p style={{ fontSize: "0.875rem", opacity: 0.7 }}>{children}</p>
    </a>
  );
}
