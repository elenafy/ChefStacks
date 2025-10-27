import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 mt-16">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Line */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          {/* Left side - Brand with logo and tagline */}
          <div className="flex items-center space-x-3 mb-4 sm:mb-0">
            <Image
              src="/images/red_logo.png"
              alt="ChefStacks"
              width={80}
              height={50}
              className="h-12 w-auto"
            />
            <span className="text-slate-700 text-sm">
            All your recipes, saved and simplified in one place.
            </span>
          </div>
          
          {/* Right side - Links */}
          <div className="flex space-x-6">
            <a href="https://forms.gle/bm5U91diYpzts1EfA" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
              Tell us what you think
            </a>
            <a href="/terms" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
              Terms of Service
            </a>
            <a href="/privacy" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
              Privacy Policy
            </a>
          </div>
        </div>

        {/* Bottom Line */}
        <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0">
          <span className="text-slate-600 text-sm">Curious? Check out more stuff we make:</span>
          <div className="flex items-center space-x-4">
            <a href="https://somethingTrueandBeautiful.com" className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 text-sm transition-colors">
              <Image
                src="/images/rose_logo.png"
                alt="SomethingTrueandBeautiful"
                width={20}
                height={20}
                className="h-5 w-5"
              />
              <span>SomethingTrueandBeautiful.com</span>
            </a>
            <a href="https://TheLearningDictionary.com" className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 text-sm transition-colors">
              <Image
                src="/images/learningdictionarylogo.gif"
                alt="TheLearningDictionary"
                width={20}
                height={20}
                className="h-5 w-5"
              />
              <span>TheLearningDictionary.com</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
