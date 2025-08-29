import { Icon } from '#app/components/ui/icon.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'

export const VisibilityHint = ({ message }: { message: string }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Icon
          name="lock-closed"
          className="h-4 w-4"
          aria-hidden
          data-testid="visibility-hint"
        />
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)
