const { insertPostData } = require('./db/db_insert'); // ensure path is correct based on your project structure

async function initializePosts(client) {
  const posts = [
    {
      postId: '123e4567-e89b-12d3-a456-426614174000',
      title: "Azodu Content Policy",
      author: "azodu",
      category: "azodu",
      postType: "text",
      content: `<h1>Azodu Content Policy</h1><p>Welcome to Azodu! Our platform is dedicated to fostering a vibrant community where members can share ideas, engage in discussions, and contribute content in a variety of forms. To ensure a positive experience for everyone, we have established the following content guidelines that all users must follow.</p>
  
      <h2>1. Respect for Others</h2>
      <ul>
          <li><strong>Harassment and Bullying:</strong> Do not engage in harassment, bullying, or threats of violence. Content that directly or indirectly threatens, harasses, or bullies individuals or groups is not allowed.</li>
          <li><strong>Racism:</strong> Content that promotes, supports, or condones violence against individuals or groups based on race, ethnicity, religion, gender, sexual orientation, disability, or national origin is not permitted. Expressions of hate or derogatory terms meant to disparage any racial group or ethnicity are prohibited.</li>
          <li><strong>Personal Information:</strong> Sharing private or personal information about other users without explicit consent is strictly prohibited. This includes any non-public personal data such as physical addresses, phone numbers, and private photos.</li>
      </ul>
  
      <h2>2. Prohibited Content</h2>
      <ul>
          <li><strong>Illegal Activities:</strong> Do not post content that promotes or facilitates illegal activities. This includes, but is not limited to, the sale or trade of substances that are illegal in many jurisdictions, such as drugs and weapons.</li>
          <li><strong>Sexually Explicit Content:</strong> Pornography and sexually explicit material are not permitted on the platform. Nude or sexual images that have been shared without the subject's consent are strictly forbidden.</li>
          <li><strong>Violence and Gore:</strong> Content that glorifies violence or celebrates the suffering or humiliation of others is not allowed. Graphic images or videos involving accidents, deaths, or serious injuries must be marked with an appropriate warning if shared for informational or educational purposes.</li>
      </ul>
  
      <h2>3. Policy on Paid and Sponsored Content</h2>
      <p>At Azodu, we strive to maintain a transparent and authentic community environment. To ensure this, we strictly prohibit the following:</p>
      <ul>
          <li><strong>Paid or Sponsored Content:</strong> Any content that has been paid for or sponsored by any entity, whether directly or indirectly, is not allowed, unless it is explicitly marked as an advertisement or paid promotion. This includes but is not limited to content promoting products, services, political agendas, or other initiatives that involve financial transactions aimed at gaining visibility or influence on our platform.</li>
          <li><strong>Political Campaign Content:</strong> Content that is part of a political spending campaign, including advocacy for specific political causes or candidates, funded by political groups or their affiliates, is strictly prohibited. This policy is in place to prevent the possibility of influencing our community members through financially backed promotions.</li>
          <li><strong>Astroturfing:</strong> Any attempt to create a false impression of grassroots support, commonly known as "astroturfing," where the true financial backers behind the support are hidden, is banned. This includes organized efforts to manipulate community discourse or opinion, masquerading paid operatives as independent community members.</li>
      </ul>
  
      <h2>4. Intellectual Property</h2>
      <p>Do not post content that infringes on others' intellectual property rights. This includes unauthorized sharing of copyrighted materials such as movies, music, games, and software.</p>
  
      <h2>5. Spam and Manipulative Content</h2>
      <p>Avoid posting unsolicited promotional or commercial content. The repetitive posting of similar messages or excessive posting of the same content across various threads or communities is considered spam.</p>
      <p>Manipulating or interfering with site features to artificially inflate the popularity of certain content is prohibited.</p>
  
      <h2>6. Respecting User Privacy</h2>
      <p>Content or actions that violate user privacy or data protection rights are not permitted. This includes any attempt to collect or disseminate personal data without authorization.</p>
  
      <h2>7. Changes to the Policy</h2>
      <p>Azodu reserves the right to modify these guidelines at any time. We encourage users to review the policy periodically to stay informed of any changes.</p>
  
  `,
      thumbnail: undefined,
      aiSummary: '',
      skipLinkCheck: true
    },
    {
      postId: '123e4567-e89b-12d3-a456-426614174001',
      title: "How it works",
      author: "azodu",
      category: "azodu",
      postType: "text",
      content: ` <h2>How it works</h2>
      <p>
          Welcome to Azodu, a platform where impartiality and community engagement reshape how content is shared and discussed online. Here are some of the things which make us different ...
      </p>
      <ul>
          <li>
              <strong>Impartial Moderation:</strong> At Azodu, all content moderation is handled by AI, not humans. Our mods never sleep and don't have political biases. Our AI evaluates content based on its adherence to our <a target="_blank" href="/c/azodu/123e4567-e89b-12d3-a456-426614174000/azodu-content-policy">content policy</a> and its relevance to the respective category. There is no human interpretation involved.
          </li>
          <li>
              <strong>Autonomy of Thought:</strong> Our AI moderators do not evaluate truthfulness because we believe it is the right of the individual to <strong>determine truth for themselves</strong>. We trust our users to engage with information responsibly and make informed judgments based on their own reasoning, rather than the reasoning of board rooms, bureaucrats, moderators, policy directors and the like. This approach ensures that every member of our community can contribute to and benefit from a truly open dialogue, fostering a richer, more nuanced understanding of the world.
          </li>
          <li>
          <strong>No shadowbanning</strong>: We believe that silencing someone while keeping them unaware they\’ve been silenced is a violation of human rights unique to the digital age. We therefore, do not perform shadowbans or any form of censorship that is not open to public scrutiny.
          </li>
          <li>
              <strong>Clean and Focused UI:</strong> We pride ourselves on a minimalist design that emphasizes readability and interaction. Our interface promotes discussions around content rather than the content itself. Azodu is more a platform to discuss content than to consume content.
          </li>
          <li>
              <strong>AI-Summarized Link Submissions:</strong> To enhance user convenience, all link submissions are succinctly summarized by AI.
          </li>
          <li>
              <strong>Earn Azo:</strong> Interaction on Azodu earns you Azo, our platform's currency. Azo is awarded for upvotes and can be used to create new categories, which function like mini-communities around particular topics. This system makes it impossible for a small number of users to reserve and control the best categories.
          </li>
          <li>
              <strong>Combating Astroturfing and Big Money:</strong> Unlike many platforms, Azodu actively combats the undue influence of large corporations and deceptive practices in online discourse. We enforce this through robust software protections and strict terms of service.
          </li>
      </ul>
      <p>It is our dream to create a space for the free and open exchange of ideas protected from the petty tyranny of the technologists that traditionally control online discourse.</p>
        
  `,
      thumbnail: undefined,
      aiSummary: '',
      skipLinkCheck: true
    },
    {
      postId: '123e4567-e89b-12d3-a456-426614174002',
      title: "Azodu Terms of Service",
      author: "azodu",
      category: "azodu",
      postType: "text",
      content: `<h2>Azodu Terms of Service (TOS)</h2>

      <p>Welcome to Azodu!</p>
      
      <p>These Terms of Service ("Terms") govern your use of Azodu (the "Platform"), including any content, features, and services offered by Azodu ("we," "us," or "our").</p>
      
      <h3>1. Account Registration and User Conduct</h3>
      
      <p><strong>1.1 Account Creation:</strong> To access certain features of the Platform, you may be required to register for an account. You must provide accurate and complete information when creating your account and keep your login credentials secure.</p>
      
      <p><strong>1.2 User Conduct:</strong> You agree to use the Platform in compliance with applicable laws and regulations and refrain from engaging in any conduct that:
      <ul>
        <li>Violates these Terms, our <a target="_blank" href="/c/azodu/123e4567-e89b-12d3-a456-426614174000/azodu-content-policy">Content Policy</a>, or any other posted guidelines;</li>
        <li>Infringes upon the rights of others, including intellectual property rights;</li>
        <li>Harasses, threatens, or intimidates others;</li>
        <li>Promotes hate speech, violence, or discrimination based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics;</li>
        <li>Impersonates another person or entity, or misrepresents your affiliation with a person or entity;</li>
        <li>Attempts to gain unauthorized access to the Platform or interfere with its operation.</li>
      </ul></p>
      
      <h3>2. Content Ownership and Licensing</h3>
      
      <p><strong>2.1 User Content:</strong> You retain ownership of any content you submit or post on the Platform ("User Content"). By posting User Content, you grant us a non-exclusive, royalty-free, perpetual, irrevocable, and sublicensable license to use, reproduce, modify, adapt, publish, translate, distribute, perform, and display such User Content in connection with the Platform.</p>
      
      <p><strong>2.2 Our Content:</strong> All content available on the Platform, including text, graphics, logos, images, audio clips, and software, is owned or licensed by us and is protected by copyright, trademark, and other intellectual property laws.</p>
      
      <h3>3. Platform Use and Modifications</h3>
      
      <p><strong>3.1 Availability:</strong> We strive to provide a reliable and uninterrupted service, but we do not guarantee that the Platform will be available at all times or free from errors or interruptions.</p>
      
      <p><strong>3.2 Modifications:</strong> We reserve the right to modify or discontinue any aspect of the Platform at any time without prior notice. We may also update these Terms periodically, and your continued use of the Platform after any changes indicates your acceptance of the revised Terms.</p>
      
      <h3>4. Limitation of Liability</h3>
      
      <p><strong>4.1 Disclaimer:</strong> The Platform is provided on an "as is" and "as available" basis, without warranties of any kind, express or implied. We disclaim all warranties, including but not limited to merchantability, fitness for a particular purpose, and non-infringement.</p>
      
      <p><strong>4.2 Limitation of Liability:</strong> In no event shall we be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or in connection with your use of the Platform, even if we have been advised of the possibility of such damages. Our total liability to you for any claim arising out of or related to the Platform shall not exceed the total amount paid by you, if any, for accessing the Platform.</p>
      
      <h3>5. Governing Law and Dispute Resolution</h3>
      
      <p><strong>5.1 Governing Law:</strong> These Terms shall be governed by and construed in accordance with the laws of the United States of America, without regard to its conflict of law principles.</p>
      
     
      <h3>6. Miscellaneous</h3>
      
      <p><strong>6.1 Severability:</strong> If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions shall continue to be valid and enforceable to the fullest extent permitted by law.</p>
      
      <p><strong>6.2 Entire Agreement:</strong> These Terms constitute the entire agreement between you and us regarding your use of the Platform and supersede all prior agreements and understandings.</p>
      
      <p>Thank you for using Azodu! If you have any questions or concerns about these Terms, please contact us at contact@azodu.com.</p>
      
           
  `,
      thumbnail: undefined,
      aiSummary: '',
      skipLinkCheck: true
    },
    {
      postId: '123e4567-e89b-12d3-a456-426614174003',
      title: "Azodu Privacy Policy",
      author: "azodu",
      category: "azodu",
      postType: "text",
      content: `<h1>Azodu Privacy Policy</h1>
      <p>Azodu ("we," "us," or "our") operates the azodu.com website (the "Site"). This page informs you of our policies regarding the collection, use, and disclosure of Personal Information we receive from users of the Site.</p>
  
      <h3>1. Information Collection and Use</h3>
  
      <p><strong>1.1 Information Collected:</strong> While using our Site, we may ask you to provide us with certain personally identifiable information that can be used to contact or identify you. Personally identifiable information may include, but is not limited to, your name, email address, and phone number ("Personal Information").</p>
  
      <p><strong>1.2 Log Data:</strong> Like many site operators, we collect information that your browser sends whenever you visit our Site ("Log Data"). This Log Data may include information such as your computer's Internet Protocol ("IP") address, browser type, browser version, the pages of our Site that you visit, the time and date of your visit, the time spent on those pages, and other statistics.</p>
  
      <p><strong>1.3 Google Analytics:</strong> We use Google Analytics to collect, monitor, and analyze data about user activity on our Site. Google Analytics is a web analytics service provided by Google that tracks and reports website traffic. For more information on how Google collects and processes data, please see Google's Privacy Policy: <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p>
  
      <h3>2. Cookies</h3>
  
      <p><strong>2.1 Cookies:</strong> Cookies are files with a small amount of data, which may include an anonymous unique identifier. Cookies are sent to your browser from a web site and stored on your computer's hard drive.</p>
  
      <p><strong>2.2 Use of Cookies:</strong> We use cookies to collect information and improve our Site. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our Site.</p>
  
      <h3>3. Data Security</h3>
  
      <p><strong>3.1 Data Security:</strong> The security of your Personal Information is important to us, but remember that no method of transmission over the Internet, or method of electronic storage, is 100% secure. While we strive to use commercially acceptable means to protect your Personal Information, we cannot guarantee its absolute security.</p>
  
      <h3>5. Contact Us</h3>
  
      <p><strong>5.1 Contact:</strong> If you have any questions about this Privacy Policy, please contact us at contact@azodu.com.</p>
            
  `,
      thumbnail: undefined,
      aiSummary: '',
      skipLinkCheck: true
    }
  ];

  for (const post of posts) {
    await insertPostData(client, post.title, post.author, post.category, post.postType, post.content, post.thumbnail, post.aiSummary, post.skipLinkCheck, post.postId);
  }
}

const usernames = [
  "vortex",
  "ShadowPaladin",
  "monk_59",
  "HKnight",
  "echo",
  "galactic_paladin_731",
  "Monk",
  "mystic_ranger_254",
  "VortexMonk",
  "novaninja900",
  "lunarmage527",
  "pixel_rogue_413",
  "pixel857",
  "infernomage779",
  "uyytWizard",
  "234Princess",
  "inferno_jester_886",
  "CosmicWizard",
  "QuantumMage",
  "VortexJester",
  "echosamurai123",
  "NovaRogue",
  "echo_jester",
  "spectralguru501",
  "Paladin2345",
  "astralprincess949",
  "cyberprince171",
  "phantompaladin236",
  "CyberGuru",
  "zenith_pirate_286",
  "lunarwarrior52",
  "pixel_king",
  "spectral",
  "cyber",
  "cosmic_pirate",
  "beeeeer_76",
  "nova",
  "astral",
  "echo_mage",
  "redditSucks",
  "LunarKing",
  "inferno",
  "NovaQueen",
  "hunter_758",
  "ShadowRunner",
  "neon_runner_650",
  "yyGuru",
  "LunarHunter",
  "vortexprince699",
  "NeonQueen",
  "CosmicAdventurer",
  "mystic",
  "PhantomKnight",
  "galacticpirate921",
  "quantumguru119",
  "neon_runner_342",
  "cyber",
  "shadowking279",
  "shadow",
  "baffled",
  "STDFree",
  "Mechwarrior",
  "mrbastard",
  "bane",
  "songSorry",
  "TheBestPenguin",
  "my-legs-hurt",
  "fallem3491",
  "grittycheese",
  "burgerNFries",
  "spaghettiGoat",
  "hopscotch",
  "trelephone",
  "I-passed",
  "PEMDAS",
  "not-for-you",
  "gooooGetuum",
  "Ghollem",
  "teaTreeLeaf",
  "appless",
  "maskedMuffin",
  "weirdoMan",
  "breakingBud",
  "jelletin",
  "angryfish",
  "mustard3234",
  "coolrake908324",
  "Valencia",
  "oneHundypercent",
  "basketball302",
  "KevinSog",
  "curFree",
  "polio",
  "rapsheet",
  "giventake8332",
  "maskinrobins",
  "lilo",
  "grabgate",
  "ALL-YOU-BASE",
  "Aragorn"

];

module.exports = { initializePosts,usernames };
