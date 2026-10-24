import PasswordRecovery from "@/components/password-recovery";
export default function Page() {
  return (
    <PasswordRecovery
      local={
        process.env.NODE_ENV !== "production" &&
        process.env.MAIL_MODE !== "smtp"
      }
    />
  );
}
