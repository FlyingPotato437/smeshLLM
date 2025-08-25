import { Navigation } from '@/components/layout/navigation';
import { HeroSection } from '@/components/ui/hero-section';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#111111]">
      <Navigation />
      <HeroSection />
      
      {/* Quick Access Section */}
      <div className="bg-[#111111] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-8">Explore Real-Time Smoke Plume Data</h2>
          <p className="text-lg text-gray-400 mb-8 max-w-2xl mx-auto">
            Access Stanford University&apos;s comprehensive wildfire smoke prediction platform with physics-informed AI, real-time sensor data, and advanced visualization tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/dashboard"
              className="bg-[#8C1515] text-white px-8 py-3 rounded-lg font-semibold hover:bg-[#7A1212] transition-colors"
            >
              Launch Dashboard
            </a>
            <a
              href="/chat"
              className="border border-[#8C1515] text-[#8C1515] px-8 py-3 rounded-lg font-semibold hover:bg-[#8C1515] hover:text-white transition-colors"
            >
              AI Assistant
            </a>
            <a
              href="/visualization"
              className="border border-gray-700 text-gray-300 px-8 py-3 rounded-lg font-semibold hover:bg-[#2a2a2a] hover:text-white transition-colors"
            >
              3D Visualization
            </a>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-[#111111] py-16 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-[#8C1515] rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-xl">🔥</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Physics-Informed AI</h3>
              <p className="text-gray-400">HYSPLIT integration with transformer models for accurate smoke plume prediction</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-[#8C1515] rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-xl">📡</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Real-Time Sensors</h3>
              <p className="text-gray-400">Raspberry Pi sensor network providing live air quality and environmental data</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-[#8C1515] rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-xl">🗺️</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">3D Visualization</h3>
              <p className="text-gray-400">Interactive 3D smoke plume visualization with Deck.gl and satellite data</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
