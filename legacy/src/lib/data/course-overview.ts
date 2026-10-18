export interface CourseModule {
	number: number;
	title: string;
	slug: string;
	description: string;
	videos: number;
	minutes: number;
	tutorial_slides: number;
	is_bonus: boolean;
}

export interface CourseOverview {
	course_name: string;
	totals: {
		modules: number;
		bonus_modules: number;
		videos: number;
		minutes: number;
		tutorial_slides: number;
		slides: number;
	};
	modules: CourseModule[];
}

const courseOverview: CourseOverview = {
	course_name: "Skyler's Sewing Secrets",
	totals: {
		modules: 6,
		bonus_modules: 1,
		videos: 40,
		minutes: 264,
		tutorial_slides: 0,
		slides: 7
	},
	modules: [
		{
			number: 1,
			title: 'Basics',
			slug: 'basics',
			description: 'Master the essential tools, fabric cutting techniques, machine sewing, and foundational hand stitches that form the cornerstone of all professional sewing projects.',
			videos: 9,
			minutes: 33,
			tutorial_slides: 0,
			is_bonus: false
		},
		{
			number: 2,
			title: 'Seams',
			slug: 'seams',
			description: 'Create couture-quality finishes with French seams, pin hems, flat felled seams, and elegant binding techniques that transform garments from homemade to professional.',
			videos: 7,
			minutes: 46,
			tutorial_slides: 0,
			is_bonus: false
		},
		{
			number: 3,
			title: 'Zippers',
			slug: 'zippers',
			description: 'Conquer zipper installation with three essential techniques: covered zippers for invisible closures, exposed zippers as design features, and invisible zippers seamlessly integrated into French seams.',
			videos: 3,
			minutes: 31,
			tutorial_slides: 0,
			is_bonus: false
		},
		{
			number: 4,
			title: 'Shapes',
			slug: 'shapes',
			description: 'Add professional details with straps, rouleaux, belts, collar corners, piping, and mitred corners. Master working with curves and structured elements for polished results.',
			videos: 12,
			minutes: 47,
			tutorial_slides: 0,
			is_bonus: false
		},
		{
			number: 5,
			title: 'Pockets',
			slug: 'pockets',
			description: 'Elevate any garment with rounded patch pockets, lined pockets, invisible side pockets in French seams, and the elegant Dior flap pocket—a hallmark of haute couture.',
			videos: 4,
			minutes: 59,
			tutorial_slides: 0,
			is_bonus: false
		},
		{
			number: 6,
			title: 'Fabric Manipulation',
			slug: 'fabric-manipulation',
			description: 'Transform plain fabrics into works of art with lace appliqué, gathered frills, and pintucks that add dimension, texture, and movement to your designs.',
			videos: 3,
			minutes: 12,
			tutorial_slides: 0,
			is_bonus: false
		},
		{
			number: 7,
			title: 'Chanel Skirt',
			slug: 'chanel-skirt',
			description: 'Bring together all your skills in a comprehensive project. Create your own classic Chanel-inspired skirt from start to finish, applying professional techniques throughout.',
			videos: 2,
			minutes: 34,
			tutorial_slides: 0,
			is_bonus: true
		}
	]
};

export default courseOverview;
