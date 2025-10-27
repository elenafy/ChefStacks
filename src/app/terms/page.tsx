import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Chef Stacks",
  description: "Terms of Service for Chef Stacks - Recipe extraction and management platform",
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="prose prose-lg max-w-none">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>
          
          <p className="text-gray-600 mb-8">
            <strong>Last updated:</strong> {new Date().toLocaleDateString()}
          </p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                By accessing and using Chef Stacks ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-700 leading-relaxed">
                Chef Stacks is a recipe extraction and management platform that allows users to:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mt-4">
                <li>Extract recipes from YouTube videos using AI technology</li>
                <li>Save, organize, and manage personal recipe collections</li>
                <li>Create and share recipe cards</li>
                <li>Access recipe content from various online sources</li>
                <li>Use the service with or without creating an account</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. User Accounts and Registration</h2>
              <p className="text-gray-700 leading-relaxed">
                You may use Chef Stacks without creating an account, but creating an account provides additional features such as:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mt-4">
                <li>Permanent storage of your recipe collections</li>
                <li>Cross-device synchronization</li>
                <li>Enhanced sharing capabilities</li>
                <li>Personalized experience</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                When you create an account, you agree to provide accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Acceptable Use</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                You agree to use Chef Stacks only for lawful purposes and in accordance with these Terms. You agree not to:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Use the service for any illegal or unauthorized purpose</li>
                <li>Attempt to gain unauthorized access to any part of the service</li>
                <li>Interfere with or disrupt the service or servers connected to the service</li>
                <li>Use automated systems to access the service without permission</li>
                <li>Extract recipes from copyrighted content without proper authorization</li>
                <li>Share or distribute content that violates intellectual property rights</li>
                <li>Upload malicious code or attempt to compromise the security of the service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Intellectual Property Rights</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>Your Content:</strong> You retain ownership of any recipes, notes, or other content you create or upload to Chef Stacks. By using the service, you grant us a limited license to store, process, and display your content as necessary to provide the service.
              </p>
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>Third-Party Content:</strong> Recipes extracted from external sources (such as YouTube videos) may be subject to copyright protection. We do not claim ownership of such content and encourage users to respect intellectual property rights.
              </p>
              <p className="text-gray-700 leading-relaxed">
                <strong>Our Service:</strong> The Chef Stacks platform, including its design, functionality, and underlying technology, is protected by intellectual property laws. You may not copy, modify, or distribute our service without permission.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Privacy and Data Protection</h2>
              <p className="text-gray-700 leading-relaxed">
                Your privacy is important to us. Our collection and use of personal information is governed by our Privacy Policy, which is incorporated into these Terms by reference. By using the service, you consent to the collection and use of information as described in our Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Chef Stacks integrates with third-party services including:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>YouTube for video content access</li>
                <li>Memories.ai for AI-powered recipe extraction</li>
                <li>Supabase for data storage and authentication</li>
                <li>Other services as needed to provide functionality</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                Your use of these third-party services is subject to their respective terms of service and privacy policies. We are not responsible for the actions or policies of these third parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Service Availability</h2>
              <p className="text-gray-700 leading-relaxed">
                We strive to provide reliable service, but we do not guarantee that Chef Stacks will be available at all times. The service may be temporarily unavailable due to maintenance, updates, or technical issues. We reserve the right to modify or discontinue the service at any time with or without notice.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Disclaimers and Limitations of Liability</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>No Warranty:</strong> Chef Stacks is provided "as is" without warranties of any kind, either express or implied. We do not warrant that the service will be error-free, uninterrupted, or free of viruses or other harmful components.
              </p>
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>Recipe Accuracy:</strong> While we use AI technology to extract recipes, we cannot guarantee the accuracy, completeness, or safety of extracted recipes. Users should exercise caution and use their judgment when following recipes.
              </p>
              <p className="text-gray-700 leading-relaxed">
                <strong>Limitation of Liability:</strong> To the maximum extent permitted by law, Chef Stacks shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or use, arising out of or relating to your use of the service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Termination</h2>
              <p className="text-gray-700 leading-relaxed">
                You may stop using Chef Stacks at any time. We may suspend or terminate your access to the service at our discretion, with or without notice, for any reason including violation of these Terms. Upon termination, your right to use the service will cease immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Changes to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of significant changes by posting the updated Terms on our website. Your continued use of the service after such modifications constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Governing Law</h2>
              <p className="text-gray-700 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Chef Stacks operates, without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Contact Information</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions about these Terms of Service, please contact us at <a href="mailto:artspeak365@gmail.com" className="text-blue-600 hover:text-blue-800 underline">artspeak365@gmail.com</a> or through our website.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
