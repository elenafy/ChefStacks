import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Chef Stacks",
  description: "Privacy Policy for Chef Stacks - How we collect, use, and protect your data",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="prose prose-lg max-w-none">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
          
          <p className="text-gray-600 mb-8">
            <strong>Last updated:</strong> {new Date().toLocaleDateString()}
          </p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                This Privacy Policy describes how Chef Stacks ("we," "our," or "us") collects, uses, and protects your information when you use our recipe extraction and management platform. We are committed to protecting your privacy and being transparent about our data practices.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">2.1 Information You Provide</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-6">
                <li><strong>Account Information:</strong> Email address, display name, and profile information when you create an account</li>
                <li><strong>Recipe Content:</strong> Recipes you save, notes you add, and collections you create</li>
                <li><strong>URLs:</strong> YouTube video URLs or other recipe source URLs you submit for extraction</li>
                <li><strong>Feedback:</strong> Any feedback, comments, or support requests you send us</li>
              </ul>

              <h3 className="text-xl font-medium text-gray-900 mb-3">2.2 Information We Collect Automatically</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-6">
                <li><strong>Usage Data:</strong> How you interact with our service, pages visited, features used</li>
                <li><strong>Device Information:</strong> Browser type, operating system, device identifiers</li>
                <li><strong>Log Data:</strong> IP address, access times, error logs, and performance data</li>
                <li><strong>Cookies and Similar Technologies:</strong> To remember your preferences and improve your experience</li>
              </ul>

              <h3 className="text-xl font-medium text-gray-900 mb-3">2.3 Information from Third Parties</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>YouTube Data:</strong> Video metadata, channel information, and content details when you extract recipes</li>
                <li><strong>Authentication Data:</strong> Information from authentication providers (Google, etc.) when you sign in</li>
                <li><strong>AI Processing Data:</strong> Recipe extraction results from our AI service providers</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-700 leading-relaxed mb-4">We use the information we collect to:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Provide and maintain the Chef Stacks service</li>
                <li>Extract recipes from videos and other sources you submit</li>
                <li>Save, organize, and sync your recipe collections across devices</li>
                <li>Authenticate your identity and secure your account</li>
                <li>Improve our service through analytics and user feedback</li>
                <li>Communicate with you about service updates, security issues, or support</li>
                <li>Comply with legal obligations and protect our rights</li>
                <li>Prevent fraud and ensure service security</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Information Sharing and Disclosure</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">4.1 We Do Not Sell Your Data</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We do not sell, rent, or trade your personal information to third parties for marketing purposes.
              </p>

              <h3 className="text-xl font-medium text-gray-900 mb-3">4.2 When We Share Information</h3>
              <p className="text-gray-700 leading-relaxed mb-4">We may share your information in the following circumstances:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Service Providers:</strong> With trusted third parties who help us operate our service (data storage, AI processing, analytics)</li>
                <li><strong>Legal Requirements:</strong> When required by law, court order, or to protect our rights and safety</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>Consent:</strong> When you explicitly consent to sharing your information</li>
                <li><strong>Public Content:</strong> Recipes you choose to make public may be visible to other users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed mb-4">Chef Stacks integrates with several third-party services:</p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">5.1 Data Storage and Authentication</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>Supabase:</strong> We use Supabase for user authentication, data storage, and database management. Your account information and recipe data are stored securely on Supabase's infrastructure.
              </p>

              <h3 className="text-xl font-medium text-gray-900 mb-3">5.2 AI and Content Processing</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>Memories.ai:</strong> We use Memories.ai to extract recipe information from videos. Video URLs and extracted content are processed by this service.
              </p>

              <h3 className="text-xl font-medium text-gray-900 mb-3">5.3 Video Content</h3>
              <p className="text-gray-700 leading-relaxed">
                <strong>YouTube:</strong> We access YouTube videos and metadata through the YouTube Data API to extract recipe information. This is subject to YouTube's Terms of Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Data Security</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We implement appropriate technical and organizational measures to protect your personal information:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Encryption of data in transit and at rest</li>
                <li>Secure authentication and access controls</li>
                <li>Regular security assessments and updates</li>
                <li>Limited access to personal information on a need-to-know basis</li>
                <li>Secure hosting infrastructure through trusted providers</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Your Rights and Choices</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">7.1 Account Management</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
                <li>Update your profile information at any time</li>
                <li>Delete your account and associated data</li>
                <li>Export your recipe data</li>
                <li>Control the privacy settings of your recipes</li>
              </ul>

              <h3 className="text-xl font-medium text-gray-900 mb-3">7.2 Data Rights</h3>
              <p className="text-gray-700 leading-relaxed mb-4">Depending on your location, you may have the right to:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Access your personal information</li>
                <li>Correct inaccurate information</li>
                <li>Delete your personal information</li>
                <li>Restrict processing of your information</li>
                <li>Data portability</li>
                <li>Object to processing</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Data Retention</h2>
              <p className="text-gray-700 leading-relaxed">
                We retain your information for as long as necessary to provide our service and fulfill the purposes outlined in this Privacy Policy. When you delete your account, we will delete your personal information, though some data may be retained for legal or technical reasons (such as backup systems) for a limited period.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Chef Stacks is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. International Data Transfers</h2>
              <p className="text-gray-700 leading-relaxed">
                Your information may be transferred to and processed in countries other than your own. We ensure that such transfers comply with applicable data protection laws and that appropriate safeguards are in place to protect your information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Changes to This Privacy Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on our website and updating the "Last updated" date. Your continued use of the service after such changes constitutes acceptance of the updated Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions about this Privacy Policy or our data practices, please contact us at <a href="mailto:artspeak365@gmail.com" className="text-blue-600 hover:text-blue-800 underline">artspeak365@gmail.com</a> or through our website.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Regional Privacy Rights</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">13.1 European Union (GDPR)</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                If you are in the EU, you have additional rights under the General Data Protection Regulation (GDPR), including the right to data portability, the right to be forgotten, and the right to object to processing. Contact us to exercise these rights.
              </p>

              <h3 className="text-xl font-medium text-gray-900 mb-3">13.2 California (CCPA)</h3>
              <p className="text-gray-700 leading-relaxed">
                If you are a California resident, you have rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information we collect, the right to delete personal information, and the right to opt-out of the sale of personal information. We do not sell personal information as defined by the CCPA.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
