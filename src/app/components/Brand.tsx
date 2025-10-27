// src/components/Brand.tsx
import Image from 'next/image'
import Link from 'next/link'

export default function Brand() {
  return (
    <Link href="/" className="flex items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity">
      <Image
        src="/images/red_logo.png"
        alt="ChefStacks Logo"
        width={80}
        height={80}
        className="h-10 w-10 sm:h-16 sm:w-16 rounded-lg sm:rounded-xl"
      />
      <div className="text-sm sm:text-lg font-extrabold tracking-tight text-slate-900">Chef Stacks</div>
    </Link>
  );
}