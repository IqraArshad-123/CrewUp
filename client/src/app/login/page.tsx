import AuthForm from "@/components/auth-form";
export default function Page() {
  return <AuthForm dev={process.env.NODE_ENV !== "production"} />;
}
