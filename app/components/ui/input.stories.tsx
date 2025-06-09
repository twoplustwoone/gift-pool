import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
};
export default meta;

export const Default: StoryObj<typeof meta> = {
  args: { placeholder: "Enter text" },
};
