import { Navbar } from "@/modules/home/ui/components/navbar";
import { SiteFooter } from "@/modules/home/ui/components/site-footer";

interface Props {
  children: React.ReactNode;
}

const Layout = ({ children }: Props) => {
  return (
    <main className="relative flex min-h-screen flex-col">
      <div className="bg-atmosphere pointer-events-none absolute inset-0 -z-10" />
      <Navbar />
      <div className="relative flex flex-1 flex-col px-4 pb-10 pt-16 md:px-6">
        {children}
      </div>
      <SiteFooter />
    </main>
  );
};

export default Layout;
