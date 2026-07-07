const Bag = require('../models/Bag');
const Type = require('../models/Type');

// @desc    Get all bags with pagination, search & filters
// @route   GET /api/bags
// @access  Public
const getAllBags = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            search,
            minPrice, maxPrice,
            minHeight, maxHeight,
            minWidth, maxWidth,
            minWeight, maxWeight,
            color,
            capacity,
            category,
            typeId,
            collectionId,
            gender,
            sortBy = 'createdAt',
            order = 'desc',
        } = req.query;

        const filter = {};

        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }

        if (minHeight || maxHeight) {
            filter['dimensions.height'] = {};
            if (minHeight) filter['dimensions.height'].$gte = Number(minHeight);
            if (maxHeight) filter['dimensions.height'].$lte = Number(maxHeight);
        }

        if (minWidth || maxWidth) {
            filter['dimensions.width'] = {};
            if (minWidth) filter['dimensions.width'].$gte = Number(minWidth);
            if (maxWidth) filter['dimensions.width'].$lte = Number(maxWidth);
        }

        if (minWeight || maxWeight) {
            filter.weight = {};
            if (minWeight) filter.weight.$gte = Number(minWeight);
            if (maxWeight) filter.weight.$lte = Number(maxWeight);
        }

        if (color) {
            const colors = color.split(',').map((c) => c.trim());
            filter.color = colors.length === 1
                ? { $regex: colors[0], $options: 'i' }
                : { $in: colors.map((c) => new RegExp(c, 'i')) };
        }

        if (capacity) {
            const capacities = capacity.split(',').map((c) => c.trim());
            filter.capacity = capacities.length === 1
                ? { $regex: capacities[0], $options: 'i' }
                : { $in: capacities.map((c) => new RegExp(c, 'i')) };
        }

        if (gender) filter.gender = gender;
        if (collectionId) filter.collectionId = collectionId;

        // Type / Category are hierarchical: an explicit typeId wins; otherwise a
        // top-level category resolves to all Types in that category.
        if (typeId) {
            filter.typeId = typeId;
        } else if (category) {
            const types = await Type.find({ category }).select('_id');
            filter.typeId = { $in: types.map((t) => t._id) };
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const allowedSortFields = [
            'createdAt', 'price', 'title',
            'dimensions.height', 'dimensions.width', 'weight',
        ];
        const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
        const sort = { [sortField]: order === 'asc' ? 1 : -1 };

        const [bags, total] = await Promise.all([
            Bag.find(filter)
                .populate('typeId', 'title category discount note')
                .populate('collectionId', 'title logo')
                .sort(sort).skip(skip).limit(limitNum),
            Bag.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            count: bags.length,
            data: bags,
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single bag by ID
// @route   GET /api/bags/:id
// @access  Public
const getBagById = async (req, res) => {
    try {
        const bag = await Bag.findById(req.params.id)
            .populate('typeId', 'title category discount note')
            .populate('collectionId', 'title logo');
        if (!bag) {
            return res.status(404).json({ success: false, message: 'Bag not found' });
        }
        res.status(200).json({ success: true, data: bag });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a new bag
// @route   POST /api/bags
// @access  Private (Admin)
const createBag = async (req, res) => {
    try {
        const bag = await Bag.create(req.body);
        res.status(201).json({ success: true, data: bag });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Update a bag
// @route   PUT /api/bags/:id
// @access  Private (Admin)
const updateBag = async (req, res) => {
    try {
        const bag = await Bag.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!bag) {
            return res.status(404).json({ success: false, message: 'Bag not found' });
        }
        res.status(200).json({ success: true, data: bag });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete a bag
// @route   DELETE /api/bags/:id
// @access  Private (Admin)
const deleteBag = async (req, res) => {
    try {
        const bag = await Bag.findByIdAndDelete(req.params.id);
        if (!bag) {
            return res.status(404).json({ success: false, message: 'Bag not found' });
        }
        res.status(200).json({ success: true, message: 'Bag deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getAllBags,
    getBagById,
    createBag,
    updateBag,
    deleteBag,
};