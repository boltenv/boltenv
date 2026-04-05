import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function Button({ children, ...props }: ButtonProps) {
  return (
    <button
      style={{
        padding: "0.5rem 1rem",
        borderRadius: "0.375rem",
        border: "1px solid #e5e7eb",
        backgroundColor: "#000",
        color: "#fff",
        fontWeight: 500,
        cursor: "pointer",
      }}
      {...props}
    >
      {children}
    </button>
  );
}
