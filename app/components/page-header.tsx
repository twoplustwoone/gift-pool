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
          <div className="flex w-full flex-col gap-2">
            <Link
              to={props.back.href}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <LuChevronLeft className="h-4 w-4" />
              {props.back.label}
            </Link>
            <Flex justify="between" align="center" gap={2}>
              <Flex gap={2} align="center">
                {props.icon}
                <div>
                  <Text size="xl" weight="bold">
                    {props.title}
                  </Text>
                  {props.subtitle ? (
                    <Text size="sm" className="text-muted-foreground">
                      {props.subtitle}
                    </Text>
                  ) : null}
                </div>
              </Flex>
              {props.children}
            </Flex>
          </div>
        )}
      </div>
    </div>
  )
}

export { PageHeader }
