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
    // <main className="background-light850_dark100 relative">
    //   <Navbar />

    //   <div className="flex">
    //     <LeftSidebar />

    //     <section className="flex min-h-screen flex-1 flex-col px-6 pb-6 pt-36 max-md:pb-14 sm:px-14">
    //       <div className="mx-auto w-full max-w-5xl">{children}</div>
    //     </section>

    //     <RightSidebar />
    //   </div>
    // </main>
  );
}
