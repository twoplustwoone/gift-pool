import { LuChevronLeft } from 'react-icons/lu'
import { Link } from 'react-router'

import { Flex, Text } from '#app/components/ui-kit'

type SectionProps = {
  variant: 'section'
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
}

type DetailProps = {
  variant: 'detail'
  back: { label: string; href: string }
  icon: React.ReactNode
  title: string
  subtitle?: string
  children?: React.ReactNode
}

type PageHeaderProps = (SectionProps | DetailProps) & {
  contentWidth?: 'standard' | 'narrow'
}

const PageHeader = (props: PageHeaderProps) => {
  const widthClass =
    props.contentWidth === 'narrow' ? 'max-w-3xl' : 'max-w-6xl'
  return (
    <div className="border-b bg-surface shadow">
      <div className={`mx-auto flex ${widthClass} items-center gap-2 px-4 py-4 sm:px-6`}>
        {props.variant === 'section' ? (
          <>
            <Flex gap={2} align="center" className="flex-1">
              {props.icon}
              <Text size="xl" weight="bold">
                {props.title}
              </Text>
            </Flex>
            {props.children}
          </>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                to={props.back.href}
                aria-label={`Back to ${props.back.label}`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <LuChevronLeft className="h-5 w-5" />
              </Link>
              <div className="flex shrink-0 items-center">{props.icon}</div>
              <div className="min-w-0">
                <div className="truncate text-xl font-bold leading-tight">
                  {props.title}
                </div>
                {props.subtitle ? (
                  <div className="truncate text-sm leading-tight text-muted-foreground">
                    {props.subtitle}
                  </div>
                ) : null}
              </div>
            </div>
            {props.children ? (
              <div className="shrink-0">{props.children}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export { PageHeader }
