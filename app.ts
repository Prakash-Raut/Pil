import chalk from "chalk";
import { diffLines } from "diff";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

interface FileEntry {
	path: string;
	hash: string;
}

interface CommitData {
	timeStamp: string;
	message: string;
	files: FileEntry[];
	parent: string | null;
}

class Groot {
	private repoPath: string;
	private objectsPath: string;
	private headPath: string;
	private indexPath: string;

	constructor(repoPath: string = ".") {
		this.repoPath = path.join(repoPath, ".groot");
		this.objectsPath = path.join(this.repoPath, "objects"); // .groot/objects
		this.headPath = path.join(this.repoPath, "HEAD"); // .groot/HEAD
		this.indexPath = path.join(this.repoPath, "index"); // .groot/index
		this.init();
	}

	/* 
        Initialise the empty groot repository
    */
	public async init(): Promise<void> {
		await fs.mkdir(this.objectsPath, { recursive: true });
		try {
			await fs.writeFile(this.headPath, "", { flag: "wx" });
			// wx: open for writing, fail if file exists

			await fs.writeFile(this.indexPath, JSON.stringify([]), {
				flag: "wx",
			});

			console.log("Initialised an empty groot repository");
		} catch (error) {
			console.log("Already initialised the .groot folder");
		}
	}

	/* 
        Create a hash using sha1 algorithm
    */
	public hashObject(content: string): string {
		return crypto.createHash("sha1").update(content, "utf-8").digest("hex");
	}

	/* 
        Read the file and add it to the staging area
    */
	public async add(fileToBeAdded: string): Promise<void> {
		// read the file
		const fileData = await fs.readFile(fileToBeAdded, {
			encoding: "utf-8",
		});

		// hash the file
		const fileHash = this.hashObject(fileData);
		console.log(fileHash);

		// .groot/objects/abc123
		const newHashedFileObjectPath = path.join(this.objectsPath, fileHash);

		await fs.writeFile(newHashedFileObjectPath, fileData);

		await this.updateStagingArea(fileToBeAdded, fileHash);

		console.log("File added", fileToBeAdded);
	}

	public async updateStagingArea(filePath: string, fileHash: string): Promise<void> {
		// read the index file or staging area data
		const index: FileEntry[] = JSON.parse(
			await fs.readFile(this.indexPath, { encoding: "utf-8" })
		);

		// add the file to index
		index.push({ path: filePath, hash: fileHash });

		// write the updated index file
		await fs.writeFile(this.indexPath, JSON.stringify(index));
	}

	/* 
		Create a commit with message
	*/
	public async commit(message: string): Promise<void> {
		const index: FileEntry[] = JSON.parse(
			await fs.readFile(this.indexPath, { encoding: "utf-8" })
		);
		const parentCommit = await this.getCurrentHead();

		const commitData: CommitData = {
			timeStamp: new Date().toISOString(),
			message,
			files: index,
			parent: parentCommit,
		};

		const commitHash = this.hashObject(JSON.stringify(commitData));

		const commitPath = path.join(this.objectsPath, commitHash);

		await fs.writeFile(commitPath, JSON.stringify(commitData));

		// update HEAD to point to a new commit
		await fs.writeFile(this.headPath, commitHash);

		// clear the staging area
		await fs.writeFile(this.indexPath, JSON.stringify([]));

		console.log("Commit successfully created:", commitHash);
	}

	public async getCurrentHead(): Promise<string | null> {
		try {
			const head = await fs.readFile(this.headPath, { encoding: "utf-8" });
			return head.trim() || null;
		} catch (error) {
			return null;
		}
	}

	/* 
		Log all the commits
	*/
	public async log(): Promise<void> {
		let currentCommitHash = await this.getCurrentHead();
		while (currentCommitHash) {
			const commitData = await this.getCommitData(currentCommitHash);
			if (commitData) {
				console.log(
					"Commit",
					currentCommitHash,
					"Date:",
					commitData.timeStamp,
					commitData.message
				);

				currentCommitHash = commitData.parent;
			} else {
				break;
			}
		}
	}

	/* 
		Show the diff between the two commits
	*/
	public async showCommitDiff(commitHash: string): Promise<void> {
		const commitData = await this.getCommitData(commitHash);

		if (!commitData) {
			console.log("Commit not found");
			return;
		}

		console.log("Changes in the last commit are: ");

		for (const file of commitData.files) {
			console.log("File", file.path);
			const fileContent = await this.getFileContent(file.hash);
			console.log(fileContent);

			if (commitData.parent) {
				// get the parent commit data
				const parentCommitData = await this.getCommitData(commitData.parent);

				if (parentCommitData) {
					const parentFileContent = await this.getParentFileContent(
						parentCommitData,
						file.path
					);

					if (parentFileContent) {
						console.log("Diff: ");

						const diff = diffLines(parentFileContent, fileContent);

						diff.forEach((part) => {
							if (part.added) {
								process.stdout.write("++" + chalk.green(part.value));
							} else if (part.removed) {
								process.stdout.write("--" + chalk.red(part.value));
							} else {
								process.stdout.write(chalk.gray(part.value));
							}
						});
						console.log();
					} else {
						console.log("New File Content");
					}
				}
			} else {
				console.log("First Commit");
			}
		}
	}

	public async getParentFileContent(parentCommitData: CommitData, filePath: string): Promise<string | null> {
		const parentFile = parentCommitData.files.find(
			(file) => file.path === filePath
		);

		if (parentFile) {
			// get the file content from the parent commit
			// and then return the content
			return await this.getFileContent(parentFile.hash);
		}
		return null;
	}

	/* 
		Get commit data by hash
	*/
	public async getCommitData(commitHash: string): Promise<CommitData | null> {
		const commitPath = path.join(this.objectsPath, commitHash);

		try {
			const commitContent = await fs.readFile(commitPath, { encoding: "utf-8" });
			return JSON.parse(commitContent) as CommitData;
		} catch (error) {
			console.log("Failed to read the commit data: ", error);
			return null;
		}
	}

	public async getFileContent(fileHash: string): Promise<string> {
		const objectPath = path.join(this.objectsPath, fileHash);

		return fs.readFile(objectPath, { encoding: "utf-8" });
	}
}

(async () => {
	const groot = new Groot();
	await groot.add("sample.txt");
	await groot.commit("Initial commit");
})();
