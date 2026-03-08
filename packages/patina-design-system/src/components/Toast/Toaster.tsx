import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  variantIcons,
} from './Toast'
import { useToast } from './useToast'
import { type LucideProps } from 'lucide-react'

// Type helper for Lucide icons to work with React 19
const IconWrapper = ({ Icon, ...props }: { Icon: any } & LucideProps) => <Icon {...props} />

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const Icon = props.variant ? variantIcons[props.variant] : variantIcons.default

        return (
          <Toast key={id} {...props}>
            <div className="flex gap-3">
              {Icon && <IconWrapper Icon={Icon} className="h-5 w-5 mt-0.5 flex-shrink-0" />}
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
