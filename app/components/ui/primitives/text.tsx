type TextProps = {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

export const Text = ({ children, size = 'md' }: TextProps) => {
  return <p className={`text-${size}`}>{children}</p>;
};
