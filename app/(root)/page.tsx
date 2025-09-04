import { auth } from "@/auth";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import Navbar from "@/components/navigation/navbar";
import RightSidebar from "@/components/navigation/RightSidebar";

export default async function Home({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  console.log(session);
  return (
    <>
      <h1>welcome to world of nextjs</h1>
    </>
  );
}
