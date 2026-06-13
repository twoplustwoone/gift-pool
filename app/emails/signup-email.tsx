import * as E from '@react-email/components';

export const SignupEmail = ({
  onboardingUrl,
  otp,
}: {
  onboardingUrl: string;
  otp: string;
}) => {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <E.Heading as="h1">Welcome to GiftPool!</E.Heading>
        <E.Text>Here&apos;s your verification code:</E.Text>
        <E.Text
          style={{
            fontSize: '32px',
            fontWeight: 700,
            letterSpacing: '8px',
            margin: '16px 0',
          }}
        >
          {otp}
        </E.Text>
        <E.Text>Or click the link to get started:</E.Text>
        <E.Link href={onboardingUrl}>{onboardingUrl}</E.Link>
      </E.Container>
    </E.Html>
  );
};
